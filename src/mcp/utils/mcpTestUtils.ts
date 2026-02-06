import type { dh as DhcType } from '@deephaven/jsapi-types';
import { vi } from 'vitest';
import type { McpToolResult } from './mcpUtils';
import { DhcService } from '../../services';
import type { Psk } from '../../types';

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
 * @param results Optional map of method names to their return values
 * @returns Mock DhcService instance with mocked methods
 */
export function createMockDhcService(results?: {
  runCode?: DhcType.ide.CommandResult | null;
  supportsConsoleType?: boolean;
  getPsk?: Psk | undefined;
}): DhcService {
  return Object.assign(Object.create(DhcService.prototype), {
    runCode: vi.fn().mockResolvedValue(results?.runCode ?? null),
    supportsConsoleType: vi
      .fn()
      .mockReturnValue(results?.supportsConsoleType ?? true),
    getPsk: vi.fn().mockResolvedValue(results?.getPsk),
  });
}
