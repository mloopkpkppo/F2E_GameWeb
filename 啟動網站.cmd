@echo off
cd /d "%~dp0"
echo PIXELIZED - Open http://localhost:3000 after the server starts.
node js/server.mjs
pause
