#!/bin/bash
# Run e2e tests against a Deephaven server
#
# Usage: ./scripts/e2e.sh --core|--coreplus [--docker] [SERVER_URL]
#   --core:      Run tests against DH Community (SERVER_URL defaults to http://localhost:10000/)
#   --coreplus:  Run tests against DH Enterprise (requires SERVER_URL)
#   --docker:    Start DH Community via Docker (optional)
#   SERVER_URL:  Deephaven server URL (required for --coreplus, optional for --core)

# Parse arguments
if [ $# -eq 0 ]; then
    echo "Error: Missing required argument --core or --coreplus"
    echo "Usage: ./scripts/e2e.sh --core|--coreplus [--docker] [SERVER_URL]"
    exit 1
fi

MODE=""
START_DOCKER=false
SERVER_URL=""

# Parse all arguments
for arg in "$@"; do
    case $arg in
        --core|--coreplus)
            MODE="$arg"
            ;;
        --docker)
            START_DOCKER=true
            ;;
        *)
            SERVER_URL="$arg"
            ;;
    esac
done

# Validate mode
if [ -z "${MODE}" ]; then
    echo "Error: Missing required argument --core or --coreplus"
    echo "Usage: ./scripts/e2e.sh --core|--coreplus [--docker] [SERVER_URL]"
    exit 1
fi

IS_CORE_SERVER=false
# Set default SERVER_URL for --core if not provided
if [ "${MODE}" = "--core" ]; then
    IS_CORE_SERVER=true
    SERVER_URL="${SERVER_URL:-http://localhost:10000/}"
elif [ -z "${SERVER_URL}" ]; then
    echo "Error: --coreplus requires a SERVER_URL argument"
    echo "Usage: ./scripts/e2e.sh --coreplus [--docker] SERVER_URL"
    exit 1
fi

# Ensure trailing slash
[[ "${SERVER_URL}" != */ ]] && SERVER_URL="${SERVER_URL}/"

# Cleanup on exit
cleanup() {
    if [ "${START_DOCKER}" = true ]; then
        echo "Cleaning up..."
        docker compose --project-directory e2e-testing down
    fi
}
trap cleanup EXIT

if [ "${START_DOCKER}" = true ]; then
    docker compose --project-directory e2e-testing up -d dhc-server

    # Wait for the DH server to start
    until [ "$(curl --silent --fail --request OPTIONS --output /dev/null ${SERVER_URL}jsapi/dh-core.js && echo 'pass' || echo 'fail')" = "pass" ]; do
        echo "Waiting for Deephaven server..."
        sleep 2
    done
    echo "Deephaven server is ready!"
fi

if [ "${IS_CORE_SERVER}" = true ]; then
    # Generate Core settings for test workspace
    node scripts/generate-test-settings.mjs --core "${SERVER_URL}"
else
    # Generate Core+ settings for test workspace
    node scripts/generate-test-settings.mjs --coreplus "${SERVER_URL}"
fi

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