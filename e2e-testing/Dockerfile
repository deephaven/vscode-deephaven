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

CMD ["npm", "run", "test:e2e"]