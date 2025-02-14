set -e

# Build
docker compose \
 --project-directory e2e-testing \
 --progress plain build \
 --build-arg NODE_VERSION="20.15.1"

# Run
docker compose \
 --project-directory e2e-testing up \
 --abort-on-container-exit \
 --exit-code-from e2e
