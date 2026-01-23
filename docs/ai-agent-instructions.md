# AI Agent Instructions Files

This document explains the different instruction file formats used in this repository to guide AI coding assistants.

## File Types and Their Purposes

### `.github/copilot-instructions.md`

**Purpose:** Provides repository-specific instructions for GitHub Copilot.

**Key Characteristics:**
- **Vendor-Specific:** Designed specifically for GitHub Copilot
- **Integration:** Automatically read by GitHub Copilot when providing code suggestions, in chat, and during code review
- **Scope:** Repository-wide guidance that applies to all interactions with Copilot
- **Use Cases:**
  - Coding style and conventions
  - Testing requirements and practices
  - Security guidelines
  - Internal libraries and frameworks to use
  - Project-specific patterns and anti-patterns

**Location:** `.github/copilot-instructions.md`

**Official Documentation:** [GitHub Docs - Adding repository custom instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)

---

### `AGENTS.md`

**Purpose:** A standardized, open format for providing instructions to multiple AI coding agents across different platforms.

**Key Characteristics:**
- **Vendor-Agnostic:** Works with GitHub Copilot, OpenAI Codex, Google Jules, Cursor, and other AI coding assistants
- **Community Standard:** An open, community-driven specification
- **Machine-Readable:** Designed to be parsed and understood by AI agents rather than primarily by humans
- **Comprehensive:** Can include detailed build commands, test procedures, project structure, and workflow instructions

**Use Cases:**
- Multi-agent environments where different AI tools need consistent guidance
- Detailed build, test, and deployment procedures
- Explicit boundaries on what agents should/shouldn't modify
- Agent persona definitions for specialized tasks (e.g., docs agent, test agent, security agent)
- Monorepos with nested AGENTS.md files for subprojects

**Location:** `AGENTS.md` (typically at repository root, can be nested for subprojects)

**Official Resources:**
- [GitHub AGENTS.md specification](https://github.com/agentsmd/agents.md)
- [GitHub Blog - How to write a great agents.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)

---

### `CLAUDE.md`

**Purpose:** Provides persistent project context specifically for Anthropic's Claude Code assistant.

**Key Characteristics:**
- **Vendor-Specific:** Designed specifically for Claude Code (Anthropic's agentic coding tool)
- **Persistent Memory:** Automatically loaded by Claude Code to provide continuous project context
- **Onboarding Manual:** Acts as an AI onboarding guide so you don't have to repeat project details
- **Human & AI Readable:** Can also serve as documentation for human contributors

**Use Cases:**
- Project overview and tech stack
- Project structure and architecture
- Custom commands and scripts
- Coding conventions and architectural decisions
- Development workflow instructions
- Known issues and todos
- Branch naming and commit message conventions

**Location:** `CLAUDE.md` (typically at repository root)

**Official Resources:**
- [Anthropic Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Creating the Perfect CLAUDE.md](https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/)

---

## Comparison Summary

| Feature | `.github/copilot-instructions.md` | `AGENTS.md` | `CLAUDE.md` |
|---------|-----------------------------------|-------------|-------------|
| **Primary Audience** | GitHub Copilot | Multiple AI agents | Claude Code |
| **Vendor Lock-in** | GitHub-specific | Open standard | Anthropic-specific |
| **Standardization** | GitHub official | Community-driven | Anthropic official |
| **Best For** | GitHub Copilot users | Multi-tool AI workflows | Claude Code users |
| **Format** | Markdown (freeform) | Markdown (structured) | Markdown (freeform) |
| **Scope** | Code suggestions & review | Comprehensive agent guidance | Persistent project context |

---

## Which Should You Use?

### Use `.github/copilot-instructions.md` if:
- You primarily use GitHub Copilot
- You want to customize Copilot's behavior for your repository
- You need to enforce coding standards through Copilot Code Review

### Use `AGENTS.md` if:
- Your team uses multiple AI coding assistants
- You want a vendor-agnostic solution
- You need detailed, machine-readable instructions for autonomous agents
- You're working with complex monorepos

### Use `CLAUDE.md` if:
- You use Anthropic's Claude Code assistant
- You want persistent context that doesn't need to be re-explained
- You need Claude to understand your project structure and conventions

### Use Multiple Files:
It's perfectly valid (and increasingly common) to use multiple instruction files:
- `.github/copilot-instructions.md` + `AGENTS.md` for GitHub Copilot users who also want broader agent support
- `AGENTS.md` + `CLAUDE.md` for teams using multiple AI tools
- All three if you want comprehensive coverage across all major AI coding assistants

The key is to avoid duplicating content—each file should complement the others based on its specific audience and purpose.

---

## Current Implementation in This Repository

This repository currently uses **`.github/copilot-instructions.md`** to provide GitHub Copilot with:
- Testing best practices and tooling instructions
- VS Code API mocking guidelines
- Code style conventions

As our AI agent usage evolves, we may consider adding `AGENTS.md` or `CLAUDE.md` for broader agent support.
