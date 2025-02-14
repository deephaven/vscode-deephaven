ARG NODE_VERSION=NOTAREALVERSION

FROM node:$NODE_VERSION-alpine AS node
WORKDIR /work/

RUN node --version

# Package contents should change less frequently than the source code, so copy
# and install them in earlier layer
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN ls -la

# TODO: We need this in order to build e2e-testing/out/runner.mjs, but the runner
# also indirectly calls check:types. Would be nice to not have it happen 2x.
RUN npm run check:types

CMD ["npm", "run", "test:e2e"]