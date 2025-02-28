ARG NODE_VERSION=NOTAREALVERSION

FROM node:$NODE_VERSION AS node
WORKDIR /work/

RUN node --version

RUN apt-get update && \
    apt-get install -y \
    dbus \
    xvfb \
    # Even though Chromium is downloaded dynamically by vscode-extension-tester,
    # we explicitly install so that lib dependencies are automatically installed.
    chromium

# Package contents should change less frequently than the source code, so copy
# and install them in earlier layer
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN ls -la

# TODO: We need this in order to build e2e-testing/out/runner.mjs, but the runner
# also indirectly calls check:types. Would be nice to not have it happen 2x.
RUN npm run check:types

RUN chmod +x ./e2e-testing/entrypoint.sh
ENTRYPOINT ["./e2e-testing/entrypoint.sh"]
CMD ["npm", "run", "test:e2e"]
# CMD ["tail", "-f", "/dev/null"]