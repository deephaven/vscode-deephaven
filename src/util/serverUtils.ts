import { ServerState, ServerType } from '../common';

export function getInitialServerStates(
  type: ServerType,
  configs: { url: string }[]
): ServerState[] {
  return configs.map(config => ({
    type,
    url: config.url,
  }));
}
