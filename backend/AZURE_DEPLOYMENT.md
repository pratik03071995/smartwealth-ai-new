# SmartWealth AI - Azure VM Deployment Guide

## 🚀 Quick Deployment Steps

### 1. Prepare Your Azure VM

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3 python3-pip git curl nginx

# Install Node.js (for frontend)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clone and Setup Repository

```bash
# Clone your repository
git clone https://github.com/shubhampal1/smart-wealth-ai.git
cd smart-wealth-ai/backend

# Make deployment script executable
chmod +x deploy_azure.sh
```

### 3. Configure Environment

```bash
# Copy the Azure environment template
cp azure.env .env

# Edit the .env file with your actual values
nano .env
```

**Update these values in .env:**
- `AZURE_VM_IP` - Your Azure VM's public IP address
- `DATABRICKS_HOST` - Your Databricks host
- `DATABRICKS_TOKEN` - Your Databricks token
- `DATABRICKS_WAREHOUSE_ID` - Your warehouse ID
- `SEARCH_API_KEY` - Your Google Custom Search API key
- `SEARCH_ENGINE_ID` - Your Google Custom Search Engine ID

### 4. Deploy the Application

```bash
# Run the deployment script
./deploy_azure.sh
```

### 5. Configure Nginx (Optional - for production)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/smartwealth

# Add this configuration:
server {
    listen 80;
    server_name your-azure-vm-ip;

    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Enable the site
sudo ln -s /etc/nginx/sites-available/smartwealth /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Configure Firewall

```bash
# Allow HTTP and HTTPS traffic
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 5001
sudo ufw allow 5173
sudo ufw enable
```

### 7. Set Up as System Service (Production)

```bash
# Copy service file
sudo cp smartwealth.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable smartwealth
sudo systemctl start smartwealth

# Check status
sudo systemctl status smartwealth
```

## 🔧 Environment Variables

The application uses these key environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_VM_URL` | Your Azure VM URL | `http://your-ip:5173` |
| `FRONTEND_ORIGINS` | CORS origins | `http://localhost:5173,http://your-ip:5173` |
| `DATABRICKS_HOST` | Databricks host | `adb-xxx.azuredatabricks.net` |
| `DATABRICKS_TOKEN` | Databricks token | `dapi-xxx` |
| `SEARCH_API_KEY` | Google API key | `AIzaSyCxxx` |

## 🌐 Accessing Your Application

- **Backend API**: `http://your-azure-vm-ip:5001`
- **Health Check**: `http://your-azure-vm-ip:5001/api/health`
- **Frontend**: `http://your-azure-vm-ip:5173` (if frontend is deployed)

## 📊 Monitoring

```bash
# View application logs
tail -f app.log

# Check service status
sudo systemctl status smartwealth

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🔄 Updates

To update your application:

```bash
cd /home/ubuntu/smart-wealth-ai
git pull origin main
cd backend
sudo systemctl restart smartwealth
```

## 🛠️ Troubleshooting

### Common Issues:

1. **Port not accessible**: Check firewall settings
2. **CORS errors**: Verify `FRONTEND_ORIGINS` in .env
3. **Ollama not starting**: Check if Ollama is installed and running
4. **Database connection**: Verify Databricks credentials

### Debug Commands:

```bash
# Check if ports are listening
sudo netstat -tlnp | grep :5001

# Check Ollama status
ollama list

# Test API endpoint
curl http://localhost:5001/api/health
```

## 📝 Notes

- Replace `your-azure-vm-ip` with your actual Azure VM IP address
- Ensure all required API keys are properly configured
- The application runs on port 5001 by default
- Ollama runs on port 11434 by default
- Frontend typically runs on port 5173
