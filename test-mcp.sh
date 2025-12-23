#!/bin/bash

# Test script for MCP server

echo "Testing MCP Server..."
echo ""

# Test 1: List available tools
echo "1. Listing available tools..."
curl -X POST http://localhost:63307/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq . > test.json

echo ""
echo ""

# Test 2: Call runCode tool (this will fail without a proper URI, but will show it's working)
echo "2. Calling runCode tool..."
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "runCode",
      "arguments": {
        "languageId": "python"
      }
    }
  }' | jq .

echo ""
