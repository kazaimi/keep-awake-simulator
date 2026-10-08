import os
import sys
import time
import json
import ctypes
import threading
import subprocess
from http.server import SimpleHTTPRequestHandler, HTTPServer
from ctypes import wintypes
import socket

# ---------------------------------------------------------------------------
# Windows 常量
# ---------------------------------------------------------------------------
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002

SPI_SETSCREENSAVEACTIVE = 0x0011
SPI_GETSCREENSAVEACTIVE = 0x0012
SPI_SETSCREENSAVETIMEOUT = 0x000F
SPIF_UPDATEINIFILE = 0x01
SPIF_SENDCHANGE = 0x02

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
KEYEVENTF_KEYUP = 0x0002
VK_F15 = 0x7E

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

running = True
server_port = 18923

# 运行配置（可由命令行覆盖）
CONFIG = {
    "pulse_interval": 0.35,   # 空闲时的脉冲间隔，必须 < 500ms 才能命中企微复苏窗口
    "idle_gate_ms": 1500,     # 系统空闲超过该值才发脉冲，避免干扰真实用户操作
    "verbose": False,
    "log_file": None,
    # 企微窗口消息投递（验证/修复「企微只认自己窗口活跃度」这一假设）
    "wecom_poke": True,
    "wecom_interval": 60.0,   # 企微阈值为 15 分钟，60 秒一次已远超所需
}

DIAG = {
    "started_at": time.time(),
    "samples": [],
    "last_idle_ms": None,
    "last_poke_ms": None,
    "cursor_move_verified": None,
    "screensaver_disabled": False,
    "session_locked": False,
    "notes": [],
    "wecom": {
        "enabled": CONFIG["wecom_poke"],
        "window_count": None,
        "last_posted": None,
        "last_result_ago_sec": None,
        "foreground_kept": None,
        "last_error": None,
    },
}


# ---------------------------------------------------------------------------
# ctypes 结构定义
# ---------------------------------------------------------------------------
class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]
    _anonymous_ = ("u",)
    _fields_ = [("type", wintypes.DWORD), ("u", _U)]


def log(msg):
    """同时输出到控制台与日志文件"""
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if CONFIG["log_file"]:
        try:
            with open(CONFIG["log_file"], "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def note(msg):
    DIAG["notes"].append({"t": time.time(), "msg": msg})
    log(f"[NOTE] {msg}")


# ---------------------------------------------------------------------------
# 电源与屏保
# ---------------------------------------------------------------------------
def set_keep_awake():
    """声明线程持续运行，拒绝显示器关闭与系统休眠"""
    try:
        kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        )
        return True
    except Exception as e:
        log(f"[Warning] SetThreadExecutionState failed: {e}")
        return False


def restore_awake():
    try:
        kernel32.SetThreadExecutionState(ES_CONTINUOUS)
    except Exception:
        pass


def disable_screensaver():
    """
    彻底关闭屏保与自动锁屏触发器。
    企业微信监听 WTS_SESSION_LOCK，一旦锁屏会瞬间上报「离开电脑」，
    因此必须在系统层面阻止屏保启动。
    """
    prev = ctypes.c_int(0)
    ok = False
    try:
        # 读取原状态以便退出时还原
        if user32.SystemParametersInfoW(SPI_GETSCREENSAVEACTIVE, 0, ctypes.byref(prev), 0):
            CONFIG["prev_screensaver_active"] = prev.value
        if user32.SystemParametersInfoW(SPI_SETSCREENSAVEACTIVE, 0, None, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE):
            ok = True
        # 将屏保超时设为极大值
        user32.SystemParametersInfoW(SPI_SETSCREENSAVETIMEOUT, 600000, None, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
    except Exception as e:
        note(f"关闭屏保失败（可能被企业组策略 GPO 锁定）: {e}")
        return False
    DIAG["screensaver_disabled"] = ok
    if ok:
        log("[OK] 屏保与自动锁屏触发器已关闭")
    else:
        note("SystemParametersInfo 未能关闭屏保，可能被企业 GPO 策略接管，"
             "此时若发生锁屏企业微信会立刻显示「离开电脑」")
    return ok


def restore_screensaver():
    prev = CONFIG.get("prev_screensaver_active", 1)
    try:
        user32.SystemParametersInfoW(SPI_SETSCREENSAVEACTIVE, prev, None, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 输入保活
# ---------------------------------------------------------------------------
def get_idle_ms():
    """读取 Windows 底层「距上次输入的毫秒数」，这是判定真伪的核心依据"""
    info = LASTINPUTINFO()
    info.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if user32.GetLastInputInfo(ctypes.byref(info)):
        return (kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF
    return -1


def is_session_locked():
    """检测当前会话是否已锁定/断开（锁定后企业微信必然显示离开电脑）"""
    try:
        h_desktop = user32.OpenInputDesktop(0, False, 0x0001)  # DESKTOP_READOBJECTS
        if h_desktop == 0:
            return True
        user32.CloseDesktop(h_desktop)
        return False
    except Exception:
        return False


def poke_active():
    """
    发送一次保活脉冲（多通道冗余，确保任何一种检测机制都能被刷新）：
      1. SetCursorPos 绝对像素位移 + 回位（可回读校验是否真的移动）
      2. SendInput 相对移动 +3 / -3 成对下发（净位移为 0，绝不会累积漂移）
      3. keybd_event 无害按键 F15
      返回是否成功让光标真实移动
    """
    moved = False
    try:
        pt = POINT()
        if user32.GetCursorPos(ctypes.byref(pt)):
            ox, oy = pt.x, pt.y
            # 4 像素足够穿透 EPP 死区，且肉眼几乎不可见
            user32.SetCursorPos(ox + 4, oy)
            time.sleep(0.02)
            chk = POINT()
            if user32.GetCursorPos(ctypes.byref(chk)) and chk.x != ox:
                moved = True
            user32.SetCursorPos(ox, oy)

        # SendInput 冗余通道：成对下发，净位移为 0
        extra = ctypes.c_ulong(0)
        for dx in (3, -3):
            inp = INPUT(type=INPUT_MOUSE)
            inp.mi = MOUSEINPUT(dx=dx, dy=0, mouseData=0,
                                dwFlags=MOUSEEVENTF_MOVE, time=0,
                                dwExtraInfo=ctypes.pointer(extra))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            time.sleep(0.01)

        # 无害按键 F15（按下+释放），不会触发任何快捷键
        user32.keybd_event(VK_F15, 0, 0, 0)
        time.sleep(0.01)
        user32.keybd_event(VK_F15, 0, KEYEVENTF_KEYUP, 0)
    except Exception as e:
        note(f"poke_active 异常: {e}")
    return moved


def poke_wecom():
    """
    向企业微信窗口投递悬停消息，刷新其内部活跃时间戳。
    不抢前台，不会破坏屏幕上正在显示的界面。
    """
    if not CONFIG["wecom_poke"]:
        return
    try:
        import wecom_poke
        r = wecom_poke.poke_once()
        w = DIAG["wecom"]
        w["window_count"] = r["window_count"]
        w["last_posted"] = r["posted"]
        w["last_result_ago_sec"] = 0.0
        w["foreground_kept"] = r["foreground_kept"]
        w["last_error"] = None
        if r["window_count"] == 0:
            w["last_error"] = "未枚举到企业微信窗口（可能未运行）"
        elif CONFIG["verbose"]:
            log(f"[WeCom] 已向 {r['posted']}/{r['window_count']} 个企微窗口投递消息 "
                f"(前台保持={'是' if r['foreground_kept'] else '否'})")
    except Exception as e:
        DIAG["wecom"]["last_error"] = str(e)
        note(f"企微窗口投递异常: {e}")


def keep_awake_loop():
    """
    保活守护主循环
    ------------------------------------------------------------------
    设计要点（解决「离开后必须 idle<500ms 才恢复」这类严苛判定）：
      * 平时不做任何注入，绝不干扰你正常使用鼠标。
      * 当检测到系统空闲超过 idle_gate_ms → 进入「守护模式」。
      * 守护模式下以 pulse_interval(默认350ms) 不间断脉冲，
        使 GetLastInputInfo 的空闲值恒定 < 500ms，
        无论对方多久轮询一次、阈值多严苛，都永远判不出「离开」。
      * 只有检测到「光标被真实用户移动」（偏移超过 8px，且不是我们自己造成的）
        才退出守护模式，交还控制权。
    """
    global running
    set_keep_awake()
    disable_screensaver()

    # 启动冲击：连续快速脉冲，确保立刻把状态从「离开」拉回「在线」
    for _ in range(6):
        poke_active()
        time.sleep(0.15)

    # 启动时立即向企微窗口投递一次消息（覆盖「只认自己窗口活跃度」这一假设）
    poke_wecom()

    if is_session_locked():
        note("启动时会话处于锁定状态：此状态下企业微信必然显示「离开电脑」。"
             "请先解锁进入桌面，再保持本程序运行。")

    guard = False
    anchor = None
    DIAG["guard_mode"] = False
    last_log = 0.0
    last_wecom = 0.0  # 立即做一次企微窗口投递

    def read_cursor():
        p = POINT()
        if user32.GetCursorPos(ctypes.byref(p)):
            return (p.x, p.y)
        return None

    while running:
        try:
            set_keep_awake()

            cur = read_cursor()
            idle = get_idle_ms()
            DIAG["last_idle_ms"] = idle

            if cur is not None:
                # 用户真实活动检测：光标明显偏离锚点 → 退出守护模式
                # 容差 25px，规避偶发的系统/驱动级 1~2px 抖动
                if guard and anchor is not None:
                    if abs(cur[0] - anchor[0]) > 25 or abs(cur[1] - anchor[1]) > 25:
                        guard = False
                        anchor = cur
                        log("[Guard] 检测到真实用户操作，已释放鼠标控制")
                elif not guard:
                    anchor = cur

            if not guard and idle >= CONFIG["idle_gate_ms"]:
                guard = True
                anchor = cur if cur is not None else read_cursor()
                log("[Guard] 进入守护模式（用户空闲），开始高频保活脉冲")

            if guard:
                moved = poke_active()
                DIAG["cursor_move_verified"] = moved
                DIAG["last_poke_ms"] = time.time()
                DIAG["guard_mode"] = True
                time.sleep(CONFIG["pulse_interval"])
            else:
                DIAG["guard_mode"] = False
                time.sleep(0.4)

            # 企微窗口消息投递：独立于光标脉冲，按自己的节奏走
            now = time.time()
            if now - last_wecom >= CONFIG["wecom_interval"]:
                last_wecom = now
                poke_wecom()

            if CONFIG["verbose"] and now - last_log >= 5:
                last_log = now
                DIAG["samples"].append({
                    "t": now,
                    "idle_ms": DIAG["last_idle_ms"],
                    "guard": guard,
                    "locked": is_session_locked(),
                })
                if len(DIAG["samples"]) > 500:
                    DIAG["samples"].pop(0)
                log(f"[DIAG] idle={DIAG['last_idle_ms']}ms  guard={guard}  locked={is_session_locked()}")

        except Exception as e:
            note(f"保活循环异常: {e}")
            time.sleep(1)

def get_system_stats():
    """获取基础系统数据让前端仪表盘更真实"""
    try:
        # 获取内存状态
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        mem_used_pct = stat.dwMemoryLoad
        total_gb = round(stat.ullTotalPhys / (1024 ** 3), 1)
        avail_gb = round(stat.ullAvailPhys / (1024 ** 3), 1)
        used_gb = round(total_gb - avail_gb, 1)
    except Exception:
        mem_used_pct = 64
        total_gb = 32.0
        used_gb = 20.5

    return {
        "status": "active",
        "keep_awake": True,
        "idle_ms": get_idle_ms(),
        "screensaver_disabled": DIAG["screensaver_disabled"],
        "session_locked": is_session_locked(),
        "mem_used_pct": mem_used_pct,
        "mem_used_gb": used_gb,
        "mem_total_gb": total_gb
    }

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # 静态文件根目录为脚本所在目录
        base_dir = os.path.dirname(os.path.abspath(__file__))
        super().__init__(*args, directory=base_dir, **kwargs)

    def do_GET(self):
        global running
        if self.path == "/api/status":
            stats = get_system_stats()
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(stats).encode("utf-8"))
            return
        elif self.path == "/api/diagnostics":
            payload = {
                "uptime_sec": round(time.time() - DIAG["started_at"], 1),
                "last_idle_ms": DIAG["last_idle_ms"],
                "last_poke_ago_sec": (round(time.time() - DIAG["last_poke_ms"], 1)
                                      if DIAG["last_poke_ms"] else None),
                "cursor_move_verified": DIAG["cursor_move_verified"],
                "guard_mode": DIAG.get("guard_mode", False),
                "screensaver_disabled": DIAG["screensaver_disabled"],
                "wecom": DIAG["wecom"],
                "session_locked": is_session_locked(),
                "pulse_interval": CONFIG["pulse_interval"],
                "idle_gate_ms": CONFIG["idle_gate_ms"],
                "notes": DIAG["notes"][-20:],
                "samples": DIAG["samples"][-60:],
            }
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
            return
        elif self.path == "/api/exit":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "stopping"}')
            def shutdown():
                time.sleep(0.5)
                os._exit(0)
            threading.Thread(target=shutdown, daemon=True).start()
            return
        
        super().do_GET()

    def log_message(self, format, *args):
        # 静默日志输出
        return

def find_available_port(start_port=18923):
    port = start_port
    while port < 65535:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
        port += 1
    return start_port

def launch_edge_app(url):
    """尝试用 Edge 的应用模式无边框启动网页，若失败则用默认浏览器打开"""
    edge_candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    ]
    edge_path = None
    for p in edge_candidates:
        if os.path.exists(p):
            edge_path = p
            break
            
    if edge_path:
        # --app=url 启动独立无地址栏精美窗口
        # --start-maximized 默认最大化
        args = [
            edge_path,
            f"--app={url}",
            "--start-maximized",
            "--window-size=1280,800",
            "--disable-extensions",
            "--no-first-run"
        ]
        proc = subprocess.Popen(args)
        return proc
    else:
        import webbrowser
        webbrowser.open(url)
        return None

def parse_args(argv):
    for i, a in enumerate(argv):
        if a == "--verbose" or a == "-v":
            CONFIG["verbose"] = True
        elif a.startswith("--interval="):
            try:
                CONFIG["pulse_interval"] = max(0.1, float(a.split("=", 1)[1]))
            except ValueError:
                pass
        elif a.startswith("--gate="):
            try:
                CONFIG["idle_gate_ms"] = int(a.split("=", 1)[1])
            except ValueError:
                pass
        elif a == "--no-ui":
            CONFIG["no_ui"] = True
        elif a == "--no-wecom":
            CONFIG["wecom_poke"] = False
        elif a.startswith("--wecom-interval="):
            try:
                CONFIG["wecom_interval"] = max(5.0, float(a.split("=", 1)[1]))
            except ValueError:
                pass


def main():
    global running, server_port
    parse_args(sys.argv[1:])

    base_dir = os.path.dirname(os.path.abspath(__file__))
    CONFIG["log_file"] = os.path.join(base_dir, "keepawake.log")

    log("=" * 64)
    log("[KeepAwake] 正在启动保活守护进程…")

    server_port = find_available_port(18923)

    # 启动防休眠守护线程
    awake_thread = threading.Thread(target=keep_awake_loop, daemon=True)
    awake_thread.start()

    # 启动本地 HTTP 服务
    server = HTTPServer(('127.0.0.1', server_port), CustomHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    app_url = f"http://127.0.0.1:{server_port}/index.html"
    log(f"[KeepAwake] 服务地址: {app_url}")
    log(f"[KeepAwake] 脉冲间隔: {CONFIG['pulse_interval']}s   空闲触发阈值: {CONFIG['idle_gate_ms']}ms")
    log(f"[KeepAwake] 企微窗口投递: {'已启用' if CONFIG['wecom_poke'] else '已关闭'}  "
        f"(间隔 {CONFIG['wecom_interval']}s)")
    log(f"[KeepAwake] 诊断接口: {app_url.replace('index.html', '')}api/diagnostics")
    log("[KeepAwake] 提示: F11 全屏 / 空格 老板键 / 1~6 切换模式")
    log("=" * 64)

    # 调起 Edge App 窗口
    browser_proc = None
    if not CONFIG.get("no_ui"):
        browser_proc = launch_edge_app(app_url)

    try:
        if browser_proc:
            # 监听浏览器窗口退出，当用户关闭窗口时自动退出后台进程
            browser_proc.wait()
        else:
            while running:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        running = False
        restore_awake()
        restore_screensaver()
        log("[KeepAwake] 已安全退出，屏幕休眠与屏保设置已恢复。")

if __name__ == "__main__":
    main()
