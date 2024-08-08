// TODO: https://github.com/deephaven/deephaven-core/issues/5911 to address the
// underlying issue of jsapi-types being unaware of `dhinternal`. Once that is
// addressed, this can be removed and `global.d.ts` can be removed from tsconfig
// (assuming we have not introduced any new global types here).
declare module dhinternal.io.deephaven.proto.ticket_pb {
  export type TypedTicket = unknown;
}
