@echo off
chcp 65001 >nul
title OpenCode Go 本地反代
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  没有找到 Node.js。请先安装：https://nodejs.org  ^(点 LTS，一路下一步^)
  echo.
  pause
  exit /b
)
echo http://127.0.0.1:8787| clip
echo.
echo  已把这个地址复制到剪贴板：http://127.0.0.1:8787
echo  ^(酒馆里「反向代理」填它；代理密码填你的 oc_sk_...；模型 gemini-4-argon^)
echo.
node yw-oc-local.js
echo.
echo 反代已停止。按任意键关闭窗口。
pause >nul
