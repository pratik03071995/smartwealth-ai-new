#!/bin/bash

echo "🛑 Stopping SmartWealth AI Frontend..."

# Stop Vite server
if [ -f .vite.pid ]; then
    VITE_PID=$(cat .vite.pid)
    if kill -0 $VITE_PID 2>/dev/null; then
        echo "📦 Stopping Vite server (PID: $VITE_PID)..."
        kill $VITE_PID
        rm .vite.pid
    else
        echo "📦 Vite server already stopped"
        rm .vite.pid
    fi
fi

# Stop ngrok tunnel
if [ -f .ngrok.pid ]; then
    NGROK_PID=$(cat .ngrok.pid)
    if kill -0 $NGROK_PID 2>/dev/null; then
        echo "🌐 Stopping ngrok tunnel (PID: $NGROK_PID)..."
        kill $NGROK_PID
        rm .ngrok.pid
    else
        echo "🌐 ngrok tunnel already stopped"
        rm .ngrok.pid
    fi
fi

# Kill any remaining processes
pkill -f "vite" 2>/dev/null
pkill -f "ngrok" 2>/dev/null

echo "✅ All services stopped!"
