#!/bin/bash

echo "🚀 Starting SmartWealth Backend with 10-second timeout..."

# Start the app in background
python3 app.py &
APP_PID=$!

# Wait for 10 seconds
sleep 10

# Check if the app is still running
if kill -0 $APP_PID 2>/dev/null; then
    echo "✅ App started successfully and is still running"
    echo "📡 Testing health endpoint..."
    curl -s http://localhost:5000/api/health && echo "✅ Health check passed" || echo "❌ Health check failed"
    echo "🎉 Backend is ready!"
    wait $APP_PID
else
    echo "❌ App failed to start or crashed within 10 seconds"
    exit 1
fi

