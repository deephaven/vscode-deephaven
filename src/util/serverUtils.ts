import { ServerState, ServerType } from '../common';

/**
 * Get initial server states based on server configs.
 * @param type
 * @param configs
 */
export function getInitialServerStates(
  type: ServerType,
  configs: { url: string }[]
): ServerState[] {
  return configs.map(config => ({
    type,
    url: config.url,
  }));
}
