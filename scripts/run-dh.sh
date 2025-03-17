#!/bin/bash
# Start a DH Community server

set -e

DH_PORT=10000
DH_SERVER_URL="http://localhost:$DH_PORT"

# Start DH via Docker Compose
echo "Starting Deephaven Server..."
docker compose --project-directory e2e-testing up -d dhc-server

# Wait for the DH server to start
timeout=60
elapsed=0
interval=2

until [ "$(curl --silent --fail --request OPTIONS --output /dev/null $DH_SERVER_URL/jsapi/dh-core.js && echo 'pass' || echo 'fail')" = "pass" ]; do
    echo "Waiting for Deephaven server... (${elapsed}s elapsed)"
    sleep $interval
    elapsed=$((elapsed + interval))
    if [ $elapsed -ge $timeout ]; then
        echo "Error: Deephaven server did not start within $timeout seconds!"
        exit 1
    fi
done
echo "Deephaven server $DH_SERVER_URL is ready!"