"""
KeepAwake 诊断工具 —— 双击 诊断.bat 即可运行
用于确认「企业微信为什么还显示离开电脑」，逐层排查：
  1. 本机屏幕是否会被锁屏（会话锁定 / 屏保 / 空闲值）
  2. 保活守护进程是否在运行、守护模式是否生效
  3. 企业微信客户端进程与窗口状态
  4. 是否处于远程桌面会话（GPO 常见拦截点）
"""
import ctypes
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from ctypes import wintypes

BASE_PORT = 18923
SCAN_RANGE = 40

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


def get_idle_ms():
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if user32.GetLastInputInfo(ctypes.byref(info)):
        return (kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF
    return -1


def is_session_locked():
    h = user32.OpenInputDesktop(0, False, 0x0001)
    if h == 0:
        return True
    user32.CloseDesktop(h)
    return False


def is_rdp_session():
    return user32.GetSystemMetrics(0x1000) != 0  # SM_REMOTESESSION


def find_keepawake_port():
    """在候选端口中寻找正在运行的 KeepAwake 服务"""
    for port in range(BASE_PORT, BASE_PORT + SCAN_RANGE):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                pass
        except OSError:
            continue
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/api/diagnostics", timeout=2
            ) as r:
                if r.status == 200:
                    return port, json.loads(r.read().decode("utf-8"))
        except Exception:
            continue
    return None, None


def list_wecom():
    """检查企业微信进程是否存在，以及是否有可见主窗口"""
    found = []
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq WXWork.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        for line in out.splitlines():
            line = line.strip()
            if line and "WXWork.exe" in line:
                # CSV 顺序: name, pid, session name, session#, mem
                parts = [p.strip('"') for p in line.split('","')]
                if len(parts) >= 5:
                    found.append({
                        "pid": parts[1],
                        "session_name": parts[2],
                        "session_id": parts[3],
                    })
                else:
                    found.append({"pid": "?", "session_name": "?", "session_id": "?"})
    except Exception as e:
        return [{"error": str(e)}]
    return found


def list_keepawake_process():
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq python.exe", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        return len([l for l in out.splitlines() if "python.exe" in l])
    except Exception:
        return -1


def main():
    print("=" * 66)
    print("  KeepAwake 保活诊断报告   " + time.strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 66)

    # ---------- 1. 系统层 ----------
    print("\n[1] 系统与会话状态")
    idle = get_idle_ms()
    locked = is_session_locked()
    rdp = is_rdp_session()
    print(f"    距上次真实输入 : {idle} ms" + ("   ✅ 极低，保活良好" if 0 <= idle < 500 else
                                          ("   ⚠️ 偏高" if idle >= 0 else "   ❌ 读取失败")))
    print(f"    会话是否锁定   : {'是 ❌ 已锁屏 —— 企微必然显示离开' if locked else '否 ✅'}")
    print(f"    是否远程桌面   : {'是 ⚠️ RDP 断开/挂起会瞬间置为离开' if rdp else '否 ✅'}")

    # ---------- 2. 保活守护 ----------
    print("\n[2] KeepAwake 守护进程")
    port, diag = find_keepawake_port()
    nproc = list_keepawake_process()
    if diag:
        print(f"    服务端口       : {port}")
        print(f"    守护模式       : {'✅ 已开启（高频保活中）' if diag.get('guard_mode') else '⚠️ 未开启（检测到你正在使用电脑，属正常）'}")
        print(f"    光标脉冲有效   : {'✅' if diag.get('cursor_move_verified') else '❌ 无效'}")
        print(f"    屏保关闭       : {'✅' if diag.get('screensaver_disabled') else '⚠️ 被企业组策略(GPO)拦截'}")
        w = diag.get("wecom") or {}
        if w.get("enabled"):
            print(f"    企微窗口投递   : 已启用，最近一次向 {w.get('last_posted')}/{w.get('window_count')} 个窗口投递")
            print(f"    前台未被抢占   : {'✅' if w.get('foreground_kept') else '❌ 异常'}")
            if w.get("last_error"):
                print(f"    ⚠️ {w['last_error']}")
        else:
            print("    企微窗口投递   : 已关闭（--no-wecom）")
        print(f"    运行时长       : {diag.get('uptime_sec')} 秒")
        if diag.get("notes"):
            print("    备注:")
            for n in diag["notes"]:
                print(f"      - {n['msg']}")
    else:
        print(f"    ❌ 未检测到运行中的 KeepAwake 服务（端口 {BASE_PORT}~{BASE_PORT + SCAN_RANGE}）")
        print(f"       检测到 python 进程数: {nproc}")
        print("       → 请先双击 启动.bat 启动后再运行本诊断")

    # ---------- 3. 企业微信 ----------
    print("\n[3] 企业微信客户端")
    wecom = list_wecom()
    if not wecom:
        print("    ⚠️ 未检测到 WXWork.exe 进程（企业微信未运行？）")
    else:
        for w in wecom:
            if "error" in w:
                print(f"    查询失败: {w['error']}")
            else:
                print(f"    ✅ 进程运行中 PID={w['pid']}  会话名={w['session_name']}  会话ID={w['session_id']}")

    try:
        import wecom_poke
        wins, pids = wecom_poke.enumerate_wecom_windows()
        vis = [w for w in wins if w["visible"]]
        print(f"    窗口数量: {len(wins)} 个（其中可见 {len(vis)} 个）")
        for w in vis[:4]:
            print(f"      · {hex(w['hwnd'])}  {w['class'][:28]:<28} {w['title'][:24]}  {w['width']}x{w['height']}")
    except Exception as e:
        print(f"    窗口枚举失败: {e}")

    # ---------- 4. 结论 ----------
    print("\n[4] 结论判定")
    if locked:
        print("    根因 = 会话已锁屏。任何输入模拟都无效，必须保持桌面解锁状态。")
    elif rdp:
        print("    根因 = 远程桌面会话。请改用物理机，或用 tscon 切回控制台会话。")
    elif diag and diag.get("guard_mode") and diag.get("cursor_move_verified") and 0 <= idle < 500:
        print("    保活链路完全正常（idle<500ms 且光标脉冲生效）。")
        print("    → 若企微仍显示离开，说明企微并非依据 GetLastInputInfo 判定，")
        print("      而是自身心跳/服务端状态。此时请在企微「设置-通用」中检查")
        print("      离开时间选项，并确认窗口未最小化到托盘。")
    else:
        print("    保活未完全生效，请把本报告反馈给我。")

    print("\n" + "=" * 66)
    input("\n按回车键关闭本窗口...")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        input("\n诊断异常，按回车键关闭...")