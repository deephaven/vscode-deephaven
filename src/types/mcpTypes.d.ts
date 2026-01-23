import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp';
import type { z, ZodRawShape } from 'zod';

export interface McpToolSpec<
  InputSchema extends ZodRawShape = ZodRawShape,
  OutputSchema extends ZodRawShape = ZodRawShape,
> {
  title: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
}

export type McpToolHandler<InputSchema extends ZodRawShape> =
  ToolCallback<InputSchema>;

export type McpToolHandlerArg<Spec extends McpToolSpec> = {
  [K in keyof Spec['inputSchema']]: z.infer<Spec['inputSchema'][K]>;
};

export type McpToolHandlerResult<Spec extends McpToolSpec> = Awaited<
  ReturnType<McpToolHandler<Spec['inputSchema']>>
>;

export type McpTool<Spec extends McpToolSpec = McpToolSpec> = {
  name: string;
  spec: Spec;
  handler: McpToolHandler<Spec['inputSchema']>;
};
