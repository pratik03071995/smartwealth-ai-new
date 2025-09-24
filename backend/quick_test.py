#!/usr/bin/env python3
"""
Quick test - no database connections, just check environment
"""

import os
from dotenv import load_dotenv

print("🔧 Quick environment test...")

# Load environment variables
load_dotenv()

# Check if .env file exists and has data
print(f"📁 .env file exists: {os.path.exists('.env')}")

# Check key variables
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID")

print(f"📡 DATABRICKS_HOST: {DATABRICKS_HOST}")
print(f"🔑 DATABRICKS_TOKEN: {'***' + DATABRICKS_TOKEN[-4:] if DATABRICKS_TOKEN else 'None'}")
print(f"🏢 DATABRICKS_WAREHOUSE_ID: {DATABRICKS_WAREHOUSE_ID}")

# Check if all required vars are present
if all([DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID]):
    print("✅ All Databricks credentials are present!")
else:
    print("❌ Missing some Databricks credentials")

# Test if we can import the connector (without connecting)
try:
    import databricks.sql as dbsql
    print("✅ Databricks SQL connector can be imported")
except Exception as e:
    print(f"❌ Cannot import databricks-sql-connector: {e}")

print("🏁 Quick test completed!")
