import { z } from 'zod';
import type {
  McpTool,
  McpToolHandlerArg,
  McpToolHandlerResult,
} from '../../types';
import type { IServerManager } from '../../types';
import { parseUrl } from '../../util';
import {
  runCodeOutputSchema,
  extractVariables,
  McpToolResponse,
  getFirstConnectionOrCreate,
} from '../utils';

const spec = {
  title: 'Run Deephaven Code',
  description:
    'Execute arbitrary code text in a Deephaven session. Use this for ad-hoc script execution. For running code from workspace files, use runCodeFromUri instead.',
  inputSchema: {
    code: z.string().describe('The code text to execute.'),
    languageId: z
      .string()
      .describe('The language ID for the code. Must be "python" or "groovy".'),
    connectionUrl: z
      .string()
      .describe('The Deephaven connection URL to use for execution.'),
  },
  outputSchema: runCodeOutputSchema,
} as const;

type Spec = typeof spec;
type HandlerArg = McpToolHandlerArg<Spec>;
type HandlerResult = McpToolHandlerResult<Spec>;
type RunCodeTool = McpTool<Spec>;

export function createRunCodeTool({
  serverManager,
}: {
  serverManager: IServerManager;
}): RunCodeTool {
  return {
    name: 'runCode',
    spec,
    handler: async ({
      code,
      languageId,
      connectionUrl,
    }: HandlerArg): Promise<HandlerResult> => {
      const response = new McpToolResponse();

      // Validate languageId
      if (languageId !== 'python' && languageId !== 'groovy') {
        return response.error(
          `Invalid languageId: '${languageId}'. Must be "python" or "groovy".`
        );
      }

      const parsedConnectionURL = parseUrl(connectionUrl);
      if (!parsedConnectionURL.success) {
        return response.error('Invalid URL', parsedConnectionURL.error, {
          connectionUrl,
        });
      }

      try {
        const firstConnectionResult = await getFirstConnectionOrCreate({
          connectionUrl: parsedConnectionURL.value,
          serverManager,
          languageId,
        });

        if (!firstConnectionResult.success) {
          const { details, error, errorMessage, hint } = firstConnectionResult;
          return response.errorWithHint(errorMessage, error, hint, details);
        }

        const { connection, panelUrlFormat } = firstConnectionResult;

        // Execute the code
        const result = await connection.runCode(code, languageId);

        // Extract variables from result (even if there was an error)
        const variables = extractVariables(result);

        if (result?.error) {
          return response.error('Code execution failed', result.error, {
            languageId,
            panelUrlFormat,
            variables,
          });
        }

        return response.success('Code executed successfully', {
          panelUrlFormat,
          variables,
        });
      } catch (error) {
        return response.error('Failed to execute code', error, {
          languageId,
        });
      }
    },
  };
}
