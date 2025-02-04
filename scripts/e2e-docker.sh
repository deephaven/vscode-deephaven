set -e

docker compose --project-directory e2e --progress plain build --build-arg NODE_VERSION="20.15.1"
docker compose --project-directory e2e up --abort-on-container-exit --exit-code-from e2e
