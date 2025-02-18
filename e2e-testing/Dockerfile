ARG NODE_VERSION=NOTAREALVERSION

FROM node:$NODE_VERSION AS node
WORKDIR /work/

RUN node --version

RUN apt-get update && \
    apt-get install -y \
    # Even though Chromium is downloaded dynamically by vscode-extension-tester,
    # we explicitly install so that lib dependencies are automatically installed.
    chromium \
    xvfb
# RUN apt-get update && \
#     apt-get install -y \
#     libnss3 \
#     libdbus-1-3 \
#     libatk1.0-0 \
#     libatk-bridge2.0-0 \
#     libgtk-3-0 \
#     libgbm1 \
#     libasound2 \
#     libxcomposite1 \
#     xvfb
    # libXcomposite \
    # libXdamage \
    # libXfixes \
    # libXrandr \
    # libdrm \
    # libxkbcommon \
    # libatspi

# Package contents should change less frequently than the source code, so copy
# and install them in earlier layer
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN ls -la

# TODO: We need this in order to build e2e-testing/out/runner.mjs, but the runner
# also indirectly calls check:types. Would be nice to not have it happen 2x.
RUN npm run check:types

# ENV DISPLAY=:99

# RUN xdpyinfo -display $DISPLAY > /dev/null || Xvfb $DISPLAY -screen 0 1024x768x16 &

# CMD ["tail", "-f", "/dev/null"]
CMD ["npm", "run", "test:e2e"]