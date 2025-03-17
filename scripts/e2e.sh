#!/bin/bash
# Start a DH Community server and run e2e tests

set -e

# Wait for the DH server to start
until [ "$(curl --silent --fail --request OPTIONS --output /dev/null http://localhost:10000/jsapi/dh-core.js && echo 'pass' || echo 'fail')" = "pass" ]; do
    echo "Waiting for Deephaven server..."
    sleep 2
done
echo "Deephaven server is ready!"

# Run e2e tests
echo "Running E2E tests..."
node e2e-testing/out/runner.mjs --setup