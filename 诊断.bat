@echo off
chcp 65001 >nul
title KeepAwake - 保活诊断
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% equ 0 (
    python diagnose.py
    goto :end
)

echo [ERROR] 未检测到 Python 运行环境，无法运行诊断工具。
echo 请安装 Python 3.9+ 并确保已加入 PATH。

:end