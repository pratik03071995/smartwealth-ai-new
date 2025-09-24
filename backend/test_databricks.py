#!/usr/bin/env python3
"""
Test script to check Databricks connection and data retrieval
"""

import os
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("🔧 Testing Databricks connection...")

# Get environment variables
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN")
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID")

print(f"📡 Host: {DATABRICKS_HOST}")
print(f"🔑 Token: {'***' + DATABRICKS_TOKEN[-4:] if DATABRICKS_TOKEN else 'None'}")
print(f"🏢 Warehouse ID: {DATABRICKS_WAREHOUSE_ID}")

if not all([DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID]):
    print("❌ Missing Databricks credentials!")
    exit(1)

try:
    from databricks import sql as dbsql
    print("✅ Databricks SQL connector imported")
except Exception as e:
    print(f"❌ Failed to import databricks-sql-connector: {e}")
    exit(1)

# Test connection
try:
    print("🔌 Testing connection...")
    connection = dbsql.connect(
        server_hostname=DATABRICKS_HOST.replace("https://", ""),
        http_path=f"/sql/1.0/warehouses/{DATABRICKS_WAREHOUSE_ID}",
        access_token=DATABRICKS_TOKEN
    )
    print("✅ Connected to Databricks!")
    
    # Test a simple query
    cursor = connection.cursor()
    print("📊 Testing query: SELECT 1 as test")
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print(f"✅ Query result: {result}")
    
    # Test earnings table
    print("📈 Testing earnings table...")
    cursor.execute("SELECT COUNT(*) as count FROM workspace.sw_gold.earnings_calendar_new LIMIT 1")
    earnings_count = cursor.fetchone()
    print(f"✅ Earnings table count: {earnings_count}")
    
    # Test a sample earnings record
    print("📋 Testing sample earnings data...")
    cursor.execute("SELECT * FROM workspace.sw_gold.earnings_calendar_new LIMIT 1")
    sample_earnings = cursor.fetchone()
    print(f"✅ Sample earnings: {sample_earnings}")
    
    cursor.close()
    connection.close()
    print("🎉 All tests passed! Databricks connection is working.")
    
except Exception as e:
    print(f"❌ Databricks connection failed: {e}")
    exit(1)
