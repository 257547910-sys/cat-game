@echo off
chcp 65001 >nul
echo ===================================================
echo   🐱 欢乐碰碰猫 - 海滩物语 (PopCat Beach)
echo ===================================================
echo 正在启动本地游戏服务并打开浏览器...
start http://localhost:8080/index.html
python -m http.server 8080
pause
