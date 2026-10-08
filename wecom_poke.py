"""
企业微信「离开电脑」状态保活 —— 窗口消息投递模块

背景（依据企业微信官方帮助 open.work.weixin.qq.com/help2/pc/17343 第九条）：
    「电脑登录企业微信后，15 分钟未操作过电脑，则企业微信会话显示离开电脑状态…
      此状态不支持设置关闭展示（隐身）。」
  → 15 分钟为写死常量，客户端没有任何设置项可调。

本模块针对假设 B（企业微信维护的是「自己窗口的活跃时间戳」，
而非 Windows 系统级 GetLastInputInfo）做验证与修复：

    向企业微信的窗口直接投递 (PostMessage) 鼠标移动消息，
    刷新其内部活跃时间戳，且**完全不抢前台**（不使用 SetForegroundWindow），
    因此不会破坏屏幕上正在显示的伪装界面。

安全性说明：
    - 只投递 WM_MOUSEMOVE（悬停消息），不投递鼠标点击，不会误触发送按钮；
    - 坐标取窗口客户区右侧中部的空白区域，避开左侧会话列表与底部输入框；
    - 默认不投递任何键盘消息，避免误输入。
"""

import ctypes
import time
from ctypes import wintypes

user32 = ctypes.windll.user32

WECHAT_PROC_NAMES = ("WXWork.exe",)

WM_MOUSEMOVE = 0x0200
WM_NCMOUSEMOVE = 0x00A0

#客户区取点比例（相对客户区宽高）：x=0.72, y=0.45
POINT_RATIO_X = 0.72
POINT_RATIO_Y = 0.45

EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


def _get_target_pids():
    """通过 tasklist 找到企业微信进程 PID（避免依赖 psutil）"""
    import subprocess
    pids = set()
    for name in WECHAT_PROC_NAMES:
        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {name}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, timeout=10,
            ).stdout
            for line in out.splitlines():
                line = line.strip()
                if line and name in line:
                    parts = [p.strip('"') for p in line.split('","')]
                    if len(parts) >= 2 and parts[1].isdigit():
                        pids.add(int(parts[1]))
        except Exception:
            continue
    return pids


def _window_info(hwnd):
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

    cls_buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, cls_buf, 256)
    title_buf = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(hwnd, title_buf, 512)

    rc = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rc))

    return {
        "hwnd": hwnd,
        "pid": pid.value,
        "class": cls_buf.value,
        "title": title_buf.value,
        "rect": (rc.left, rc.top, rc.right, rc.bottom),
        "width": rc.right - rc.left,
        "height": rc.bottom - rc.top,
        "visible": bool(user32.IsWindowVisible(hwnd)),
    }


def enumerate_wecom_windows(include_hidden=True, include_children=True):
    """
    枚举企业微信所有顶层窗口（可选包含子窗口）。
    子窗口同样重要：企业微信的主框架内部往往由多个子窗口拼装，
    真正维护活跃时间戳的可能是其中某一个。
    """
    pids = _get_target_pids()
    if not pids:
        return [], pids

    found = []

    def _cb(hwnd, _):
        try:
            info = _window_info(hwnd)
            if info["pid"] in pids and info["width"] > 40 and info["height"] > 40:
                if include_hidden or info["visible"]:
                    found.append(info)
        except Exception:
            pass
        return True

    user32.EnumWindows(EnumWindowsProc(_cb), 0)

    if include_children:
        extra = []
        for top in list(found):
            def _child_cb(hwnd, _):
                try:
                    info = _window_info(hwnd)
                    if info["pid"] in pids and info["width"] > 20 and info["height"] > 20:
                        extra.append(info)
                except Exception:
                    pass
                return True
            try:
                user32.EnumChildWindows(top["hwnd"], EnumWindowsProc(_child_cb), 0)
            except Exception:
                pass
        found.extend(extra)

    return found, pids


def _make_lparam(x, y):
    return (y << 16) | (x & 0xFFFF)


def poke_wecom_window(win, jitter=True):
    """
    向单个窗口客户区投递一次悬停鼠标消息。
    返回 (posted_ok, foreground_unchanged)
    """
    hwnd = win["hwnd"]
    fg_before = user32.GetForegroundWindow()

    # 屏幕坐标点→ 客户区坐标
    sx = int(win["rect"][0] + win["width"] * POINT_RATIO_X)
    sy = int(win["rect"][1] + win["height"] * POINT_RATIO_Y)
    if jitter:
        # 每次微抖动，确保每次都是「不同的」坐标，模拟真实移动轨迹
        sx += int((time.time() * 1000) % 7) - 3
        sy += int((time.time() * 1000) % 5) - 2

    pt = POINT(sx, sy)
    if not user32.ScreenToClient(hwnd, ctypes.byref(pt)):
        return False, True

    lp = _make_lparam(pt.x, pt.y)
    ok_wm = bool(user32.PostMessageW(hwnd, WM_MOUSEMOVE, 0, lp))
    # 再补一条非客户区移动，部分程序只统计这一类
    ok_nc = bool(user32.PostMessageW(hwnd, WM_NCMOUSEMOVE, 0, lp))

    time.sleep(0.005)
    fg_after = user32.GetForegroundWindow()
    return (ok_wm or ok_nc), (fg_before == fg_after)


def poke_once(verbose=False, max_windows=40):
    """
    对所有企业微信窗口投递一次消息。
    返回统计字典，供诊断与日志使用。
    """
    wins, pids = enumerate_wecom_windows()
    result = {
        "pids": sorted(pids),
        "window_count": len(wins),
        "posted": 0,
        "failed": 0,
        "foreground_kept": True,
        "targets": [],
    }

    for win in wins[:max_windows]:
        try:
            ok, fg_ok = poke_wecom_window(win)
            result["posted"] += 1 if ok else 0
            result["failed"] += 0 if ok else 1
            if not fg_ok:
                result["foreground_kept"] = False
            if verbose:
                result["targets"].append({
                    "hwnd": hex(win["hwnd"]),
                    "pid": win["pid"],
                    "class": win["class"],
                    "title": win["title"][:40],
                    "ok": ok,
                })
        except Exception:
            result["failed"] += 1

    return result


if __name__ == "__main__":
    import sys
    duration = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0
    interval = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0

    print("=" * 60)
    print("企业微信窗口消息投递测试")
    print(f"持续 {duration} 秒，每 {interval} 秒投递一次")
    print("=" * 60)

    r = poke_once(verbose=True)
    if r["window_count"] == 0:
        print("❌ 未枚举到任何企业微信窗口，请确认企业微信正在运行")
        sys.exit(1)

    print(f"进程 PID : {r['pids']}")
    print(f"窗口数量 : {r['window_count']}")
    print(f"前台保持 : {'✅ 未抢占前台' if r['foreground_kept'] else '❌ 前台被改变'}")
    print("\n投递明细（前 12 个窗口）:")
    for t in r["targets"][:12]:
        print(f"  {t['hwnd']}  pid={t['pid']:<6} {t['class'][:34]:<34} "
              f"{'✅' if t['ok'] else '❌'}  {t['title']}")

    t_end = time.time() + duration
    n = 0
    while time.time() < t_end:
        time.sleep(interval)
        rr = poke_once()
        n += 1
        print(f"  [{n}] 投递 {rr['posted']}/{rr['window_count']} 窗口  "
              f"前台保持={'✅' if rr['foreground_kept'] else '❌'}")

    print("\n测试结束。请观察你的企业微信头像旁的电脑图标是否变为蓝色。")
    input("按回车退出...")