pushd "e2e"

set -e

docker compose build --progress plain --build-arg NODE_VERSION=20.15.1
docker compose up --abort-on-container-exit --exit-code-from e2e
