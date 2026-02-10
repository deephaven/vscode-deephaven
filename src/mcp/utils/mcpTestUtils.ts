import type { dh as DhcType } from '@deephaven/jsapi-types';
import { vi } from 'vitest';
import type { McpToolResult } from './mcpUtils';
import { DhcService } from '../../services';
import type { Psk } from '../../types';
import { McpToolResponse } from './mcpUtils';

const MOCK_EXECUTION_TIME_MS = 100;

/**
 * Standard mock Deephaven server URL for testing.
 * Use `MOCK_DHC_URL.href` when a string URL is needed.
 */
export const MOCK_DHC_URL = new URL('http://localhost:10000');

/**
 * Sets up standard MCP response timing mocks for testing.
 * Call this in beforeEach() after vi.clearAllMocks().
 *
 * This function mocks the McpToolResponse.prototype.getElapsedTimeMs method to
 * return a consistent value for all tests, ensuring predictable execution time
 * measurements in test assertions.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   vi.clearAllMocks();
 *   fakeMcpToolTimings();
 * });
 * ```
 */
export function fakeMcpToolTimings(): void {
  vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
    MOCK_EXECUTION_TIME_MS
  );
}

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
    hint,
    details,
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
    details,
    executionTimeMs: MOCK_EXECUTION_TIME_MS,
  };
}

/**
 * Creates a mock DhcService for testing.
 *
 * @param values Optional map of method names to their values, return values, or
 * resolved values
 * @returns Mock DhcService instance with mocked methods
 */
export function createMockDhcService({
  serverUrl,
  runCode,
  supportsConsoleType,
  getPsk,
}: {
  serverUrl?: URL;
  runCode?: DhcType.ide.CommandResult | null;
  supportsConsoleType?: boolean;
  getPsk?: Psk | undefined;
}): DhcService {
  return Object.assign(Object.create(DhcService.prototype), {
    serverUrl: serverUrl ?? MOCK_DHC_URL,
    runCode: vi.fn().mockResolvedValue(runCode ?? null),
    supportsConsoleType: vi.fn().mockReturnValue(supportsConsoleType ?? true),
    getPsk: vi.fn().mockResolvedValue(getPsk),
  });
}
