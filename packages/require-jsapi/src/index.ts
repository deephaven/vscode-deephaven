export * from './dhc';
export * from './dhe';
export * from './errorUtils';
export * from './polyfill';
export * from './serverUtils';

// TODO: https://github.com/deephaven/deephaven-core/issues/5911 to address the
// underlying issue of jsapi-types being unaware of `dhinternal`. Once that is
// addressed, this can be removed.
declare global {
  // eslint-disable-next-line no-unused-vars
  module dhinternal.io.deephaven.proto.ticket_pb {
    export type TypedTicket = unknown;
  }
}
