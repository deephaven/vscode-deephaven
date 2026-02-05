import type { McpToolResult } from './mcpUtils';

export const MOCK_EXECUTION_TIME_MS = 100;

/**
 * Creates an MCP error result for testing.
 *
 * @param message Error message
 * @param details Optional error details
 * @param hint Optional hint for resolving the error
 * @returns MCP error result structure
 */
export function mcpErrorResult<TDetails = unknown>(
  message: string,
  details?: TDetails,
  hint?: string
): McpToolResult<false, TDetails>['structuredContent'] {
  return {
    success: false,
    message,
    ...(hint && { hint }),
    ...(details && { details }),
    executionTimeMs: MOCK_EXECUTION_TIME_MS,
  };
}

/**
 * Creates an MCP success result for testing.
 *
 * @param message Success message
 * @param details Optional result details
 * @returns MCP success result structure
 */
export function mcpSuccessResult<TDetails = unknown>(
  message: string,
  details?: TDetails
): McpToolResult<true, TDetails>['structuredContent'] {
  return {
    success: true,
    message,
    ...(details && { details }),
    executionTimeMs: MOCK_EXECUTION_TIME_MS,
  };
}
