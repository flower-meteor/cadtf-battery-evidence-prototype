@echo off
setlocal
cd /d "%~dp0"
".venv\Scripts\python.exe" -X utf8 check_environment.py
echo.
pause
endlocal
