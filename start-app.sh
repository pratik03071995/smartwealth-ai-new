#!/bin/bash

echo "🚀 Starting SmartWealth AI Frontend..."

# Navigate to the project directory
cd "$(dirname "$0")"

# Start Vite dev server in background
echo "📦 Starting Vite development server..."
cd frontend && npm run dev > ../vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to start
echo "⏳ Waiting for Vite server to start..."
sleep 5

# Start ngrok tunnel in background
echo "🌐 Starting ngrok tunnel..."
ngrok http 5173 > ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "⏳ Waiting for ngrok to start..."
sleep 3

# Get the ngrok URL
echo "🔍 Getting ngrok URL..."
sleep 2
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data['tunnels'][0]['public_url'])
" 2>/dev/null)

echo ""
echo "✅ SmartWealth AI is now running!"
echo "📍 Local URL: http://localhost:5173"
echo "🌍 Public URL: $NGROK_URL"
echo ""
echo "📊 Monitor ngrok at: http://localhost:4040"
echo "📝 Vite logs: tail -f vite.log"
echo "📝 ngrok logs: tail -f ngrok.log"
echo ""
echo "🛑 To stop: ./stop-app.sh"
echo ""

# Save PIDs for stopping later
echo $VITE_PID > .vite.pid
echo $NGROK_PID > .ngrok.pid

# Keep script running
wait
