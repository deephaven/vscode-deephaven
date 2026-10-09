import type {
  CallToolResult,
  ServerContext,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';

export interface McpToolSpec<
  InputSchema extends z.ZodObject = z.ZodObject,
  OutputSchema extends z.ZodObject = z.ZodObject,
> {
  title: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
}

/**
 * Tool handler. Assignable to the SDK's `ToolCallback`, but `ctx` is optional
 * since no tool currently uses it.
 */
export type McpToolHandler<InputSchema extends z.ZodObject> = (
  args: z.input<InputSchema>,
  ctx?: ServerContext
) => CallToolResult | Promise<CallToolResult>;

/**
 * Handler args typed as the schema *input* (pre-parse) so handlers can apply
 * their own defaults and be called directly in tests. The SDK always passes
 * the parsed output, which is assignable to this.
 */
export type McpToolHandlerArg<Spec extends McpToolSpec> = z.input<
  Spec['inputSchema']
>;

export type McpToolHandlerResult<_Spec extends McpToolSpec> = CallToolResult;

export type McpTool<Spec extends McpToolSpec = McpToolSpec> = {
  name: string;
  spec: Spec;
  handler: McpToolHandler<Spec['inputSchema']>;
};
