#!/bin/bash
# Start a DH Community server and run e2e tests

set -e

# Cleanup on exit
cleanup() {
    echo "Cleaning up..."
    docker compose --project-directory e2e-testing down
}
trap cleanup EXIT

docker compose --project-directory e2e-testing up -d dhc-server

# Wait for the DH server to start
until [ "$(curl --silent --fail --request OPTIONS --output /dev/null http://localhost:10000/jsapi/dh-core.js && echo 'pass' || echo 'fail')" = "pass" ]; do
    echo "Waiting for Deephaven server..."
    sleep 2
done
echo "Deephaven server is ready!"

# Run e2e tests
echo "Running E2E tests..."
node e2e-testing/out/runner.mjs --setup