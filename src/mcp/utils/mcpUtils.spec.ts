import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatErrorMessage, McpToolResponse } from './mcpUtils';

vi.mock('vscode');

const MOCK_EXECUTION_TIME_MS = 100;

describe('formatErrorMessage', () => {
  it.each([
    {
      name: 'without error arg',
      errorMessage: 'Operation failed',
      error: undefined,
      expected: 'Operation failed',
    },
    {
      name: 'with Error object',
      errorMessage: 'Operation failed',
      error: new Error('Connection timeout'),
      expected: 'Operation failed: Connection timeout',
    },
    {
      name: 'with string error',
      errorMessage: 'Operation failed',
      error: 'Invalid input',
      expected: 'Operation failed: Invalid input',
    },
    {
      name: 'with number error',
      errorMessage: 'Operation failed',
      error: 404,
      expected: 'Operation failed: 404',
    },
    {
      name: 'with null error',
      errorMessage: 'Operation failed',
      error: null,
      expected: 'Operation failed',
    },
  ])(
    'should format error message $name',
    ({ errorMessage, error, expected }) => {
      expect(formatErrorMessage(errorMessage, error)).toBe(expected);
    }
  );
});

describe('McpToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getElapsedTimeMs to return a fixed value
    vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockReturnValue(
      MOCK_EXECUTION_TIME_MS
    );
  });

  describe('getElapsedTimeMs', () => {
    it('should calculate elapsed time from construction', () => {
      // Restore the actual implementation for this test
      vi.spyOn(McpToolResponse.prototype, 'getElapsedTimeMs').mockRestore();

      const startTime = performance.now();
      const response = new McpToolResponse();

      // Wait a bit
      const delay = 10;
      const endTime = startTime + delay;
      vi.spyOn(performance, 'now').mockReturnValue(endTime);

      expect(response.getElapsedTimeMs()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('success', () => {
    it.each([
      {
        name: 'without details',
        message: 'Operation completed',
        details: undefined,
        expected: {
          success: true,
          message: 'Operation completed',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'with details object',
        message: 'Data retrieved',
        details: { count: 42, items: ['a', 'b'] },
        expected: {
          success: true,
          message: 'Data retrieved',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { count: 42, items: ['a', 'b'] },
        },
      },
    ])(
      'should create success result $name',
      ({ message, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.success(message, details);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });

  describe('error', () => {
    it.each([
      {
        name: 'error message only',
        errorMessage: 'Mock error message',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'Error object',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'details only',
        errorMessage: 'Mock error message',
        details: { field: 'email', reason: 'invalid format' },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { field: 'email', reason: 'invalid format' },
        },
      },
      {
        name: 'Error object and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        details: { constraint: 'unique_email', table: 'users' },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { constraint: 'unique_email', table: 'users' },
        },
      },
    ])(
      'should create error result $name',
      ({ errorMessage, error, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.error(errorMessage, error, details);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });

  describe('errorWithHint', () => {
    it.each([
      {
        name: 'hint',
        errorMessage: 'Mock error message',
        hint: 'Mock hint',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
        },
      },
      {
        name: 'error, hint, and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        hint: 'Mock hint',
        details: { module: 'pandas' },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
          details: { module: 'pandas' },
        },
      },
      {
        name: 'error and hint',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        hint: 'Mock hint',
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
        },
      },
      {
        name: 'error only',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
      {
        name: 'error and details',
        errorMessage: 'Mock error message',
        error: new Error('Mock error object'),
        details: { line: 42, column: 10 },
        expected: {
          success: false,
          message: 'Mock error message: Mock error object',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { line: 42, column: 10 },
        },
      },
      {
        name: 'hint and details',
        errorMessage: 'Mock error message',
        hint: 'Mock hint',
        details: { field: 'port', value: 'abc' },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          hint: 'Mock hint',
          details: { field: 'port', value: 'abc' },
        },
      },
      {
        name: 'details only',
        errorMessage: 'Mock error message',
        details: { errors: ['missing field', 'invalid type'] },
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
          details: { errors: ['missing field', 'invalid type'] },
        },
      },
      {
        name: 'error message only',
        errorMessage: 'Mock error message',
        expected: {
          success: false,
          message: 'Mock error message',
          executionTimeMs: MOCK_EXECUTION_TIME_MS,
        },
      },
    ])(
      'should create error result $name',
      ({ errorMessage, error, hint, details, expected }) => {
        const response = new McpToolResponse();
        const result = response.errorWithHint(
          errorMessage,
          error,
          hint,
          details
        );

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify(expected),
            },
          ],
          structuredContent: expected,
        });
      }
    );
  });
});
