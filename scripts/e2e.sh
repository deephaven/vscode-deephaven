#!/bin/bash
# Start a DH Community server and run e2e tests

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

# Copy settings to test workspace
mkdir -p e2e-testing/test-ws/.vscode
cat e2e-testing/test-settings/dhc-settings.json > e2e-testing/test-ws/.vscode/settings.json

# Run e2e tests
echo "Running E2E tests..."
node e2e-testing/out/runner.mjs --setup
test_exit_code=$?

if [ $test_exit_code -ne 0 ]; then
    echo -e "\033[0;31mE2E tests FAILED with exit code $test_exit_code\033[0m"
    exit $test_exit_code
else
    echo -e "\033[0;32mE2E tests PASSED\033[0m"
fi