/**
 * MCP tool result with standardized structure following Model Context Protocol.
 * Includes both text content (JSON stringified) and structured content for AI assistants.
 *
 * The structured content has a standardized top-level shape:
 * - success: boolean indicating operation outcome
 * - message: human-readable description of the result
 * - executionTimeMs: measured execution time
 * - hint: optional guidance for resolving errors or next steps
 * - details: optional tool-specific data
 *
 * @template TSuccess Boolean literal type for success field (true | false).
 * @template TDetails Type of tool-specific details object.
 */
export type McpToolResult<TSuccess extends boolean, TDetails = unknown> = {
  content: [{ type: 'text'; text: string }];
  structuredContent: {
    success: TSuccess;
    message: string;
    executionTimeMs: number;
    hint?: string;
    details?: TDetails;
  };
};

/**
 * Formats an error message by optionally appending error details.
 *
 * @param errorMessage Primary error message.
 * @param error Optional Error object or string to append to the message.
 * @returns The error message, optionally with error details appended.
 */
export function formatErrorMessage(
  errorMessage: string,
  error: unknown
): string {
  if (error == null) {
    return errorMessage;
  }

  const errorDetail = error instanceof Error ? error.message : String(error);
  return `${errorMessage}: ${errorDetail}`;
}

/**
 * Creates an MCP tool result conforming to the Model Context Protocol.
 *
 * Generates both text content (JSON stringified) and structured content for AI
 * assistants. The result follows a standardized format with success status,
 * message, execution time, optional hint, and optional tool-specific details.
 *
 * @param success Whether the operation succeeded.
 * @param message Human-readable description of the result.
 * @param executionTimeMs Measured execution time in milliseconds.
 * @param hint Optional guidance for resolving errors or next steps.
 * @param details Optional tool-specific data (e.g., results, context).
 * @returns MCP tool result with text and structured content.
 */
function mcpToolResult<TSuccess extends boolean, TDetails = unknown>(
  success: TSuccess,
  message: string,
  executionTimeMs: number,
  hint?: string,
  details?: TDetails
): McpToolResult<TSuccess, TDetails> {
  const structuredContent = {
    success,
    message,
    executionTimeMs,
    ...(hint == null ? undefined : { hint }),
    ...(details == null ? undefined : { details }),
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContent),
      },
    ],
    structuredContent,
  };
}

/**
 * Helper class for creating MCP tool responses with automatic execution time tracking.
 *
 * Instantiate at the start of a tool handler, perform work, then call one of the
 * success or error methods to generate a properly formatted MCP response with
 * measured execution time.
 *
 * @example
 * ```typescript
 * async function myToolHandler(args) {
 *   const response = new McpToolResponse();
 *   try {
 *     const result = await performWork(args);
 *     return response.success('Operation completed', { data: result });
 *   } catch (error) {
 *     return response.error('Operation failed', { error: error.message });
 *   }
 * }
 * ```
 */
export class McpToolResponse {
  private startTimeMs: number;

  constructor() {
    this.startTimeMs = performance.now();
  }

  /**
   * Creates a successful MCP tool result.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created.
   *
   * @param message Success message describing what was accomplished.
   * @param details Optional tool-specific result data.
   * @returns MCP tool result with success=true and measured execution time.
   */
  success<TDetails = unknown>(
    message: string,
    details?: TDetails
  ): McpToolResult<true, TDetails> {
    return mcpToolResult(
      true,
      message,
      performance.now() - this.startTimeMs,
      undefined,
      details
    );
  }

  /**
   * Creates an error MCP tool result.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created. If an error object or string is provided,
   * it will be appended to the error message for additional context.
   *
   * @param errorMessage Primary error message describing what went wrong.
   * @param error Optional Error object or string to append to the message.
   * @param details Optional contextual data (e.g., partial results, stack traces, error context).
   * @returns MCP tool result with success=false and measured execution time.
   */
  error<TDetails = unknown>(
    errorMessage: string,
    error: unknown,
    details?: TDetails
  ): McpToolResult<false, TDetails> {
    return mcpToolResult(
      false,
      formatErrorMessage(errorMessage, error),
      performance.now() - this.startTimeMs,
      undefined,
      details
    );
  }

  /**
   * Creates an error MCP tool result with guidance hint.
   *
   * Automatically calculates and includes execution time from when the
   * McpToolResponse instance was created. If an error object or string is provided,
   * it will be appended to the error message for additional context.
   *
   * @param errorMessage Primary error message describing what went wrong.
   * @param error Optional Error object or string to append to the message.
   * @param hint Optional guidance for resolving the error or suggestions for next steps.
   * @param details Optional contextual data (e.g., partial results, stack traces, error context).
   * @returns MCP tool result with success=false, hint, and measured execution time.
   */
  errorWithHint<TDetails = unknown>(
    errorMessage: string,
    error: unknown,
    hint?: string,
    details?: TDetails
  ): McpToolResult<false, TDetails> {
    return mcpToolResult(
      false,
      formatErrorMessage(errorMessage, error),
      performance.now() - this.startTimeMs,
      hint,
      details
    );
  }
}
