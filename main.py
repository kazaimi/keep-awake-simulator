import os
import sys
import time
import json
import ctypes
import threading
import subprocess
from http.server import SimpleHTTPRequestHandler, HTTPServer
import socket

# Windows 阻止息屏休眠常量
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002

running = True
server_port = 18923

def set_keep_awake():
    """设置 Windows 线程执行状态，阻止休眠与屏幕关闭"""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
        )
    except Exception as e:
        print(f"[Warning] SetThreadExecutionState failed: {e}")

def restore_awake():
    """恢复系统正常休眠设置"""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
    except Exception:
        pass

def keep_awake_loop():
    """
    后台心跳守护线程：
    1. 持续调用 SetThreadExecutionState 阻止屏幕息屏和系统休眠
    2. 发送真实微像素摆动 (+1px, -1px) 与无害虚拟键 (VK_F15)
       重置 Windows 系统的 GetLastInputInfo 计时器，
       100% 保持企业微信、钉钉、Teams 在线状态，防止变为「离开/离线」
    """
    global running
    set_keep_awake()
    
    # VK_F15 = 0x7E (Windows 高级功能键，无物理键位，不干扰任何程序)
    VK_F15 = 0x7E
    KEYEVENTF_KEYUP = 0x0002
    
    toggle = True
    while running:
        try:
            # 1. 刷新 Windows 电源常亮状态
            set_keep_awake()
            
            # 2. 真实微像素摆动（向右1像素再向左1像素，保持绝对坐标不变）
            # 这会 100% 触发系统底层 RAWINPUT，刷新 GetLastInputInfo
            ctypes.windll.user32.mouse_event(0x0001, 1, 0, 0, 0)
            time.sleep(0.05)
            ctypes.windll.user32.mouse_event(0x0001, -1, 0, 0, 0)
            
            # 3. 辅助按键脉冲：发送无害的 F15 按下与释放事件，双保险防离开
            ctypes.windll.user32.keybd_event(VK_F15, 0, 0, 0)
            time.sleep(0.02)
            ctypes.windll.user32.keybd_event(VK_F15, 0, KEYEVENTF_KEYUP, 0)
        except Exception as e:
            pass
        
        # 15秒循环一次（远低于企微3-5分钟离开的阈值，确保永远在线）
        time.sleep(15)

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

def main():
    global running, server_port
    server_port = find_available_port(18923)
    
    # 启动防休眠守护线程
    awake_thread = threading.Thread(target=keep_awake_loop, daemon=True)
    awake_thread.start()
    
    # 启动本地 HTTP 服务
    server = HTTPServer(('127.0.0.1', server_port), CustomHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    
    app_url = f"http://127.0.0.1:{server_port}/index.html"
    print("=" * 60)
    print(f"🚀 [KeepAwake] 防息屏任务模拟器已启动！")
    print(f"🌐 服务地址: {app_url}")
    print(f"🛡️ 防锁屏状态: 持续唤醒中 (SetThreadExecutionState + 微心跳已激活)")
    print(f"💡 提示: 可以在页面中按 F11 切换全屏，按 ESC 退出全屏或使用快速老板键")
    print("=" * 60)
    
    # 调起 Edge App 窗口
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
        print("\n[KeepAwake] 已安全退出，屏幕休眠设置已恢复。")

if __name__ == "__main__":
    main()
