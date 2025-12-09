@echo off
echo 🚀 Starting PeerDrop Server...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo.
)

echo ✅ Starting server on http://localhost:3001
echo.
call npm start

