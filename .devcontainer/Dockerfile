FROM mcr.microsoft.com/devcontainers/base:noble

# Your project's image. Add anything your project needs here — the devcontainer Features in
# devcontainer.json cover the rest of the setup.

USER root

# ripgrep. Claude Code's Bash tool injects its own `rg` shell function, which hides the
# absence of a real binary: anything that is not a Claude bash shell — a script, a
# subprocess, an editor extension — finds no `rg` on PATH. Install the real one.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ripgrep \
    && rm -rf /var/lib/apt/lists/*

USER vscode
