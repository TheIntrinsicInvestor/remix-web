@echo off
REM Run this from a shell where the `remix` conda env (environment.yml) is active.
cd /d "%~dp0"

REM Load secrets from the gitignored .remixweb.env (never hardcode them here --
REM this file is committed). Child cmd windows inherit these.
if exist ".remixweb.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".remixweb.env") do set "%%a=%%b"
) else (
  echo WARNING: .remixweb.env missing -- backend will fall back to key "dev-key"
)

REM Only start each server if its port is free -- launching a second next dev
REM on top of a running one wedges port 3000 instead of failing cleanly.

netstat -ano | findstr /r /c:"TCP.*:8080 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting backend on :8080 ...
  start "Remix Web backend" cmd /k "python -m uvicorn remixweb.server:app --port 8080"
) else (
  echo Backend already running on :8080
)

netstat -ano | findstr /r /c:"TCP.*:3000 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting frontend on :3000 ...
  start "Remix Web frontend" cmd /k "cd /d "%~dp0web" && npm run dev"
) else (
  echo Frontend already running on :3000
)

echo Waiting for the studio to come up...
:wait
ping -n 3 127.0.0.1 >nul
curl -s -o nul --max-time 90 http://localhost:3000/studio || goto wait

start "" http://localhost:3000/studio
