@echo off
setlocal

set "APP_DIR=%~dp0"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  set "NODE_EXE=%BUNDLED_NODE%"
) else (
  set "NODE_EXE=node"
)

cd /d "%APP_DIR%"
echo Dominic Deals is starting...
echo.
echo Local URL: http://localhost:4177
echo Phone URL: use your PC's Wi-Fi/LAN IP address with port 4177
echo.
echo Keep this window open while using the app.
echo.
"%NODE_EXE%" server.js

echo.
pause
