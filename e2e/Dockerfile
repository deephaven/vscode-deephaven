ARG NODE_VERSION=NOTAREALVERSION
FROM node:$NODE_VERSION-alpine AS node

RUN node --version

# Package contents should change less frequently than the source code, so copy
# and install them in earlier layer
COPY package.json package-lock.json ./
RUN npm ci

# Copy code
COPY tsconfig.json tsconfig.unit.json ./
COPY e2e ./e2e
COPY src ./src
COPY scripts ./scripts

RUN npm run test:e2e