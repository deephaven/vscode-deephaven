export type McpToolResult<TStructuredContent> = {
  content: [{ type: 'text'; text: string }];
  structuredContent: TStructuredContent;
};

/**
 * Creates an MCP tool result with both text content (JSON stringified) and
 * structured content for consumption by AI assistants.
 * @param startTimeMs The start time in milliseconds to calculate execution time.
 * @param structuredContent The structured data to return from the tool.
 * @returns An MCP tool result with both text and structured representations.
 */
export function mcpToolResult<
  TStructuredContent extends { executionTimeMs: number },
>(
  startTimeMs: number,
  structuredContent: Omit<TStructuredContent, 'executionTimeMs'>
): McpToolResult<TStructuredContent> {
  // Add execution time to the structured content
  const structuredContentWithExecutionTime = {
    ...structuredContent,
    executionTimeMs: performance.now() - startTimeMs,
  } as TStructuredContent;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContentWithExecutionTime),
      },
    ],
    structuredContent: structuredContentWithExecutionTime,
  };
}
