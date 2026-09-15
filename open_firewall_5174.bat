@echo off
REM 以管理员身份运行：放行 Vite 开发服务器入站 TCP/5174，供手机同一局域网访问
netsh advfirewall firewall add rule name="Vite Dev 5174" dir=in action=allow protocol=TCP localport=5174
if %errorlevel%==0 (
  echo [OK] 已添加防火墙入站规则，允许 TCP 5174
) else (
  echo [失败] 请确认本窗口是"以管理员身份运行"的 cmd
)
pause
