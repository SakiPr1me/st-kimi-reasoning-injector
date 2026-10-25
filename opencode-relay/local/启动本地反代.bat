@echo off
chcp 65001 >nul
title OpenCode Go 本地反代
cd /d "%~dp0"
node yw-oc-local.js
echo.
echo 反代已停止。按任意键关闭窗口。
pause >nul
