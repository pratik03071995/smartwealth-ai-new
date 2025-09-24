#!/bin/bash

# SmartWealth AI - Azure VM Deployment Script
# This script helps deploy the SmartWealth AI application to Azure VM

echo "🚀 SmartWealth AI - Azure VM Deployment Script"
echo "=============================================="

# Check if running on Azure VM
if [ -f /etc/azure/azure.conf ]; then
    echo "✅ Running on Azure VM"
else
    echo "⚠️  This script is designed for Azure VM deployment"
fi

# Set Azure VM IP (replace with your actual IP)
AZURE_VM_IP="your-azure-vm-ip"
AZURE_VM_PORT="5001"
AZURE_VM_FRONTEND_PORT="5173"

echo "📋 Configuration:"
echo "   Azure VM IP: $AZURE_VM_IP"
echo "   Backend Port: $AZURE_VM_PORT"
echo "   Frontend Port: $AZURE_VM_FRONTEND_PORT"

# Create .env file from azure.env template
if [ ! -f .env ]; then
    echo "📝 Creating .env file from azure.env template..."
    cp azure.env .env
    
    # Replace placeholder values
    sed -i "s/your-azure-vm-ip/$AZURE_VM_IP/g" .env
    sed -i "s/your-databricks-host/YOUR_DATABRICKS_HOST/g" .env
    sed -i "s/your-databricks-token/YOUR_DATABRICKS_TOKEN/g" .env
    sed -i "s/your-warehouse-id/YOUR_WAREHOUSE_ID/g" .env
    sed -i "s/your_google_custom_search_api_key/YOUR_GOOGLE_API_KEY/g" .env
    sed -i "s/your_google_custom_search_engine_id/YOUR_GOOGLE_ENGINE_ID/g" .env
    
    echo "✅ .env file created. Please update the placeholder values:"
    echo "   - DATABRICKS_HOST"
    echo "   - DATABRICKS_TOKEN"
    echo "   - DATABRICKS_WAREHOUSE_ID"
    echo "   - SEARCH_API_KEY"
    echo "   - SEARCH_ENGINE_ID"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# Install Ollama if not already installed
if ! command -v ollama &> /dev/null; then
    echo "🦙 Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    echo "✅ Ollama installed"
else
    echo "✅ Ollama already installed"
fi

# Start Ollama service
echo "🦙 Starting Ollama service..."
ollama serve &
OLLAMA_PID=$!
echo "✅ Ollama started with PID: $OLLAMA_PID"

# Wait for Ollama to start
sleep 5

# Pull the required model
echo "📥 Pulling Llama3 model..."
ollama pull llama3:latest

# Start the application
echo "🚀 Starting SmartWealth AI application..."
export $(cat .env | xargs)
python3 app.py &

APP_PID=$!
echo "✅ Application started with PID: $APP_PID"

# Save PIDs for cleanup
echo $OLLAMA_PID > ollama.pid
echo $APP_PID > app.pid

echo ""
echo "🎉 Deployment Complete!"
echo "======================"
echo "Backend URL: http://$AZURE_VM_IP:$AZURE_VM_PORT"
echo "Health Check: http://$AZURE_VM_IP:$AZURE_VM_PORT/api/health"
echo ""
echo "To stop the services:"
echo "  kill \$(cat ollama.pid)"
echo "  kill \$(cat app.pid)"
echo ""
echo "To view logs:"
echo "  tail -f app.log"
