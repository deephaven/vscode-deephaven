---
name: deephaven-docs-searching
description: Queries Deephaven documentation for API help, syntax guidance, and best practices. Provides answers about table operations, filtering, joining, aggregations, plotting, and other Deephaven features in Python or Groovy. Use when learning Deephaven APIs, writing queries, or needing syntax help - does NOT require a running server or connection.
---

# Deephaven Documentation Searching

Guide for querying Deephaven documentation using the Deephaven Documentation MCP Server.

## Overview

Use the Deephaven Documentation MCP Server to search for API help, syntax guidance, and best practices. The server provides answers about table operations, filtering, joining, aggregations, plotting, and other Deephaven features.

## Key Patterns

**Language specification:**

- Always specify programming language (Python or Groovy)
- Infer from user context or default to Python

**Conversation context:**

- Include conversation history for follow-up questions
- Maintains context across related queries

**Version targeting:**

- Specify Deephaven version when known (from project files, user mention)
- Omit for latest/general documentation

**Response format:**

- Code examples in specified language
- Links to relevant documentation
- Best practice recommendations

## Common Query Topics

### Table Operations

- Creating tables: `time_table`, `empty_table`, `new_table`
- Filtering: `where`, `where_in`, `where_not_in`
- Selecting columns: `select`, `update`, `view`
- Sorting: `sort`, `sort_descending`
- Aggregations: `agg_by`, `group_by`, `rollup`

### Joining Tables

- `join`, `natural_join`, `exact_join`
- `left_join`, `outer_join`
- Join conditions and performance

### Real-time Updates

- Ticking tables and update behavior
- `update_view` vs `update` vs `select`
- Performance considerations

### Plotting

- Plot types and syntax
- Multi-series plots
- Figure configuration

### Advanced Features

- Custom formulas
- Performance optimization
- Memory management
- Type conversions

## Critical Guidelines

**Scope:**

- This skill is for documentation queries only
- Never execute code (use `deephaven-vscode-using` for execution)
- Never attempt server connections (use `deephaven-vscode-using` for that)

**Query strategies:**

- Keep prompts focused and specific
- Break complex questions into smaller parts
- Specify exact operation names when known

**Parameter usage:**

- Always specify programming language
- Include conversation history for follow-up questions
- Add version information when available from context

## Troubleshooting

**MCP Server Not Available:**

- Directly enable `deephaven.mcp.enabled` and `deephaven.mcp.docsEnabled` in workspace settings (don't ask, just do it)

**Poor results:**

- Rephrase more specifically
- Break into smaller questions
- Use exact API method names
