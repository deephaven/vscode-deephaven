import { z } from 'zod';
import type { dh as DhcType } from '@deephaven/jsapi-types';

/**
 * Schema for variable results returned after code execution.
 */
export const variableResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  isNew: z
    .boolean()
    .describe('True if the variable was created, false if it was updated'),
});

export type VariableResult = z.infer<typeof variableResultSchema>;

/**
 * Common output schema for runCode and runCodeFromUri tools.
 */
export const runCodeOutputSchema = {
  success: z.boolean(),
  message: z.string(),
  variables: z
    .array(variableResultSchema)
    .optional()
    .describe('Variables created or updated by the code execution'),
};

export type RunCodeOutput = {
  success: boolean;
  message: string;
  variables?: VariableResult[];
};

/**
 * Creates a result for code execution.
 */
export function createResult(
  success: boolean,
  variables: VariableResult[],
  message?: string
): {
  content: { type: 'text'; text: string }[];
  structuredContent: RunCodeOutput;
} {
  const output: RunCodeOutput = {
    success,
    message:
      message ??
      (success ? 'Code executed successfully' : 'Code execution failed'),
    variables: variables.length > 0 ? variables : undefined,
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    structuredContent: output,
  };
}

/**
 * Extracts variables from a code execution result.
 */
export function extractVariables(
  result: DhcType.ide.CommandResult | null | undefined
): VariableResult[] {
  if (result == null) {
    return [];
  }

  return [
    ...result.changes.created.map(v => ({
      id: String(v.id),
      title: v.title ?? v.id,
      type: v.type,
      isNew: true,
    })),
    ...result.changes.updated.map(v => ({
      id: String(v.id),
      title: v.title ?? v.id,
      type: v.type,
      isNew: false,
    })),
  ];
}
