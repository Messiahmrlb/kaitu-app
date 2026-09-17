@echo off
cd /d "%~dp0"
echo 正在启动开土记录 dev server（新窗口）...
start "kaitu-dev" cmd /k "npm run dev"
timeout /t 5 >nul
echo.
echo 正在启动 cloudflared 隧道，稍候下方会显示手机访问地址：
echo.
npx cloudflared tunnel --url http://localhost:5174
