import ws from 'ws';

export class CustomEvent extends Event {
  constructor(...args: ConstructorParameters<typeof Event>) {
    super(...args);
  }
}

export function polyfillDh(): void {
  class Event {
    type: string;
    detail: unknown;

    constructor(type: string, dict: { detail: unknown }) {
      this.type = type;
      if (dict) {
        this.detail = dict.detail;
      }
    }
  }

  // Copilot will look for `window.document.currentScript` if it finds `window`.
  // Since we are polyfilling `window` below, we also need to set `document` to
  // avoid a "Cannot read properties of undefined (reading 'currentScript')"
  // error when Copilot extension is activated. Note that this scenario is only
  // hit if the polyfill runs before Copilot extension is activated.
  /* @ts-ignore */
  global.document = {};

  // Copied from https://github.com/deephaven/deephaven.io/blob/main/tools/run-examples/includeAPI.mjs
  /* @ts-ignore */
  global.self = global;
  /* @ts-ignore */
  global.window = global;
  /* @ts-ignore */
  global.this = global;
  /* @ts-ignore */
  global.Event = Event;
  /* @ts-ignore */
  global.CustomEvent = CustomEvent;

  global.WebSocket = ws as unknown as (typeof global)['WebSocket'];

  // This is needed to mimic running in a local http browser environment when
  // making requests to the server. This at least impacts websocket connections.
  // Not sure if it is needed for other requests. The url is an arbitrary
  // non-https url just to make it stand out in logs.
  // @ts-ignore
  global.window.location = new URL('http://vscode-deephaven.localhost/');
}
