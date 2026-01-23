import { z } from 'zod';
import type { ConnectionState, ServerState } from '../../types';

export const connectionResultSchema = z.object({
  isConnected: z.boolean(),
  isRunningCode: z.boolean().optional(),
  serverUrl: z.string(),
  tagId: z.string().optional(),
});

export const serverResultSchema = z.object({
  type: z.string(),
  url: z.string(),
  label: z.string().optional(),
  isConnected: z.boolean(),
  isRunning: z.boolean(),
  connectionCount: z.number(),
  isManaged: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  connections: z.array(connectionResultSchema).optional(),
});

export type ConnectionResult = z.infer<typeof connectionResultSchema>;
export type ServerResult = z.infer<typeof serverResultSchema>;

/**
 * Maps a ConnectionState to a connection result object.
 */
export function connectionToResult({
  isConnected,
  isRunningCode,
  serverUrl,
  tagId,
}: ConnectionState): ConnectionResult {
  return {
    isConnected,
    isRunningCode,
    serverUrl: serverUrl.toString(),
    tagId: tagId ? String(tagId) : undefined,
  };
}

/**
 * Maps a ServerState to a server result object with connections.
 */
export function serverToResult(
  {
    type,
    url,
    label,
    isConnected,
    isRunning,
    connectionCount,
    isManaged,
  }: ServerState,
  connections: ConnectionState[]
): ServerResult {
  return {
    type,
    url: url.toString(),
    label,
    isConnected,
    isRunning,
    connectionCount,
    isManaged,
    tags: isManaged ? ['pip', 'managed'] : [],
    connections: connections.map(connectionToResult),
  };
}
