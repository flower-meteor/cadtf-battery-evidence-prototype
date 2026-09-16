@echo off
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1

echo [1/5] Running automated tests...
".venv\Scripts\python.exe" -m pytest --junitxml=exports\pytest-results.xml
if errorlevel 1 goto :failed

echo [2/5] Verifying evidence packages...
".venv\Scripts\python.exe" -X utf8 scripts\validate_evidence.py
if errorlevel 1 goto :failed

echo [3/5] Rebuilding exports...
".venv\Scripts\python.exe" -X utf8 scripts\export_demo.py
if errorlevel 1 goto :failed

echo [4/5] Generating validation report...
".venv\Scripts\python.exe" -X utf8 scripts\generate_validation_report.py
if errorlevel 1 goto :failed

echo [5/5] Generating deliverable manifest...
".venv\Scripts\python.exe" -X utf8 scripts\generate_deliverable_manifest.py
if errorlevel 1 goto :failed

echo.
echo Validation completed successfully.
pause
exit /b 0

:failed
echo.
echo Validation failed.
pause
exit /b 1
