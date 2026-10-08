@echo off
chcp 65001 >nul
title 企业微信「离开电脑」状态 - 快速验证
cd /d "%~dp0"

echo ================================================================
echo   企业微信状态保活 - 快速验证
echo ================================================================
echo.
echo   本工具会向企业微信窗口投递悬停消息（不抢前台、不打断你手上的事）。
echo.
echo   【关键】请先观察企业微信里你头像旁的小电脑图标当前是什么颜色：
echo       灰色 = 已是「离开电脑」状态
echo       蓝色 = 在线
echo.
echo   测试开始后请每隔几秒看一眼那个图标。
echo   若图标在 10~30 秒内变蓝，说明此方案有效。
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Python 运行环境。
    goto :end
)

python wecom_poke.py 60 10

:end