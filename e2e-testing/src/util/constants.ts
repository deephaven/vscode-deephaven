export const SERVER_TITLE = 'localhost:10000';

export const STATUS_BAR_TITLE = {
  connectedPrefix: 'vm-connect  DHC:',
  disconnected: 'plug  Deephaven: Disconnected',
} as const;

/**
 * Iframes can thrash around a bit as panels are loading. These errors represent
 * cases where it's worth requerying an iframe and attempting to switch again.
 */
export const RETRY_SWITCH_IFRAME_ERRORS: ReadonlySet<string> = new Set([
  'StaleElementReferenceError',
  'NoSuchElementError',
  'NoSuchFrameError',
]);

export const VIEW_NAME = {
  servers: 'Servers',
  connections: 'Connections',
  panels: 'Panels',
} as const;
