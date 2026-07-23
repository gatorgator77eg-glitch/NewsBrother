@echo off
echo ============================================
echo   Political Map News - Starting...
echo ============================================
echo.

echo [0/2] Stopping any existing servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/2] Starting Express backend on port 3001...
start "PoliticalNews-Server" cmd /c "cd server && npm run dev"

echo [2/2] Starting Vite frontend on port 5173...
timeout /t 3 /nobreak >nul
start "PoliticalNews-Client" cmd /c "cd client && npm run dev"

echo.
echo ============================================
echo   Servers are starting up!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo ============================================
echo.
pause
