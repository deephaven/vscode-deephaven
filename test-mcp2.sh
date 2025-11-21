#!/bin/bash

# From your test script, or manually:
curl -X POST http://localhost:51520/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
