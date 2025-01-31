pushd "e2e"

docker compose up -d

# Wait for the jsapi to be available as a pseudo-healthcheck
while ! curl --fail -I http://localhost:10000/jsapi/dh-core.js; do
    echo "Waiting for jsapi to be available..."
    sleep 5
done

echo "dhc-server is healthy. Running e2e tests..."
npm run test:e2e

docker compose down