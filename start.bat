@echo off
title Fortivex AI - Launcher
cd /d "%~dp0"

echo Starting Fortivex AI Backend (FastAPI + LangGraph)...
start "Fortivex Backend (Port 8000)" cmd /k "cd /d "%~dp0backend" && "%USERPROFILE%\anaconda3\envs\langgraph_env\python.exe" -m uvicorn app.main:app --reload --port 8000"

echo Starting Fortivex AI Frontend (Vite + React)...
start "Fortivex Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Waiting for backend to finish loading AI models...
powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 }"

start "" "http://localhost:5173"
echo Ready! Both servers are running.
