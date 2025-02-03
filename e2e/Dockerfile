# FROM --platform=linux/amd64 ubuntu:20.04

# # Install dependencies
# RUN apt-get update && apt-get upgrade -y && apt-get install -y \
#     curl \
#     bash \
#     build-essential \
#     libglib2.0

FROM --platform=linux/amd64 alpine
ARG cachebust=10

RUN apk add --no-cache bash curl

WORKDIR /work/

# Copy just the .nvmrc first and install nvm/node/npm first as these will change the least often
# https://docs.docker.com/build/cache/
COPY .nvmrc .


# Set up nvm environment
# nvm needs to be run in a bash shell
SHELL ["/bin/bash", "--login", "-c"]  
# The default `.bashrc` bails on the first line if not in interactive shell. 
# We can just empty it so that the nvm install below will actually run when sourcing 
# `.bashrc`  
RUN echo "" > /root/.bashrc  
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

RUN source /root/.bashrc && nvm install
RUN source /root/.bashrc && node --version
RUN source /root/.bashrc && npm --version

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