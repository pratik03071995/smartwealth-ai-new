# Google Custom Search API Setup Guide

## Your Search Engine Details
- **Search Engine ID**: `d74dc392abb4a459c`
- **Status**: ✅ Created successfully

## Step 1: Get Google Custom Search API Key

### Option A: Google Cloud Console (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the "Custom Search API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the API key

### Option B: Google Developers Console (Alternative)
1. Go to [Google Developers Console](https://developers.google.com/custom-search/v1/introduction)
2. Click "Get a Key"
3. Create a new project or select existing
4. Copy the API key

## Step 2: Configure Your Backend

Add these lines to your `backend/.env` file:

```bash
# Google Custom Search Configuration
SEARCH_API_KEY=your_actual_api_key_here
SEARCH_ENGINE_ID=d74dc392abb4a459c
SEARCH_PROVIDER=google
```

## Step 3: Test the Configuration

Run the test script:
```bash
cd /Users/shubhampal/SmartWealth/smartwealth-ai-new/backend
python3 test_web_search.py
```

## Step 4: Restart Your Backend

```bash
# Kill existing backend
lsof -ti:5001 | xargs kill -9

# Start with web search enabled
cd /Users/shubhampal/SmartWealth/smartwealth-ai-new/backend
LLM_MODE=ollama OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3:latest OLLAMA_TIMEOUT=30 PORT=5001 python3 app.py
```

## Step 5: Test Web Search in Chat

Try these queries in your chatbot:
- "What's the latest news about Apple?"
- "Show me current Tesla stock price"
- "Microsoft earnings today"
- "Breaking news in tech stocks"

## Free Tier Limits
- **100 queries per day** (free)
- **Up to 10 results per query**
- **Perfect for development and testing**

## Troubleshooting

### If you get "API key not valid":
1. Make sure you enabled "Custom Search API" in Google Cloud Console
2. Check that the API key is correct
3. Verify the search engine ID is correct

### If you get "Search engine not found":
1. Make sure your search engine is set to "Search the entire web"
2. Check that the search engine ID matches exactly

## Next Steps

Once configured, your chatbot will automatically:
- Detect when queries need current information
- Perform web searches for news, market data, etc.
- Combine database insights with web search results
- Provide real-time information alongside your financial data

Your search engine is ready to use! 🚀
