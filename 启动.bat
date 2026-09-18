@echo off
chcp 65001 >nul
title KeepAwake - 任务模拟与防息屏守护程序

cd /d "%~dp0"

echo ================================================================
echo   KeepAwake - 正在启动防息屏与任务模拟守护系统...
echo ================================================================
echo.

:: 检查是否存在 python
where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] 检测到 Python 运行环境，正在启动内核级防锁屏守护进程...
    echo [Tips] 界面启动后可按 F11 切换全屏，按 [空格键] 切换老板键伪装模式。
    echo.
    python main.py
    goto :end
)

:: 如果没有安装 Python，通过 Edge/浏览器直接打开前端应用模式
echo [Notice] 未检测到 Python，降级使用浏览器独立 App 模式启动...
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE_PATH% set EDGE_PATH="C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if exist %EDGE_PATH% (
    echo [OK] 启动 Edge 独立沉浸式任务窗口...
    start "" %EDGE_PATH% --app="file:///%cd:\=/%/index.html" --start-maximized
) else (
    echo [OK] 使用系统默认浏览器打开...
    start "" "%~dp0index.html"
)

:end
