import { describe, it, expect } from 'vitest';
import {
  NON_RUNNING_STATUSES,
  QueryStatus,
} from '@deephaven-enterprise/query-utils';
import {
  ALL_QUERY_STATUSES,
  getQueryStatusSectionStatuses,
  isPreInitQueryStatus,
  isTerminalQueryStatus,
} from './constants';

describe('isTerminalQueryStatus', () => {
  it('follows `NON_RUNNING_STATUSES`', () => {
    for (const status of ALL_QUERY_STATUSES.filter(
      status => status !== QueryStatus.stopping
    )) {
      expect(isTerminalQueryStatus(status)).toBe(
        NON_RUNNING_STATUSES.has(status)
      );
    }
  });

  // The one addition: a stopping query is on its way to a non-running status,
  // and is the only signal the extension gets for a worker stopped externally.
  it('adds `Stopping`, which the package does not count', () => {
    expect(NON_RUNNING_STATUSES.has(QueryStatus.stopping)).toBe(false);
    expect(isTerminalQueryStatus(QueryStatus.stopping)).toBe(true);
  });

  it.each([[null], [undefined]])('is true for %j — nothing is up', status => {
    expect(isTerminalQueryStatus(status)).toBe(true);
  });

  it('is false for a status this extension does not recognize', () => {
    expect(isTerminalQueryStatus('SomeNewStatus')).toBe(false);
  });
});

describe('isPreInitQueryStatus', () => {
  it('is true for exactly the statuses that precede init', () => {
    expect(ALL_QUERY_STATUSES.filter(isPreInitQueryStatus)).toEqual([
      QueryStatus.uninitialized,
      QueryStatus.none,
    ]);
  });

  it.each([[null], [undefined]])(
    'is true for %j — a query with no designated worker has yet to start',
    status => {
      expect(isPreInitQueryStatus(status)).toBe(true);
    }
  );
});

describe('ALL_QUERY_STATUSES', () => {
  // Reading statuses off the class relies on them being enumerable statics. If a
  // package build change breaks that, the picker silently empties — fail here
  // instead.
  it('enumerates the vocabulary', () => {
    expect(ALL_QUERY_STATUSES).toContain(QueryStatus.running);
    expect(ALL_QUERY_STATUSES).toContain(QueryStatus.stopped);
    expect(ALL_QUERY_STATUSES).toContain(QueryStatus.none);
    expect(ALL_QUERY_STATUSES.length).toBeGreaterThanOrEqual(14);
  });

  it('picks up statuses only', () => {
    expect(
      ALL_QUERY_STATUSES.filter(status => typeof status !== 'string')
    ).toEqual([]);
    expect(new Set(ALL_QUERY_STATUSES).size).toBe(ALL_QUERY_STATUSES.length);
  });
});

describe('getQueryStatusSectionStatuses', () => {
  it('puts every terminal status in the Stopped section', () => {
    expect([...getQueryStatusSectionStatuses('Stopped')]).toEqual(
      ALL_QUERY_STATUSES.filter(isTerminalQueryStatus)
    );
  });

  it('puts the rest in the Running section', () => {
    expect([...getQueryStatusSectionStatuses('Running')]).toEqual(
      ALL_QUERY_STATUSES.filter(status => !isTerminalQueryStatus(status))
    );
  });

  // The filter picker only renders these two sections, so a status in neither
  // would be unfilterable.
  it('accounts for every status exactly once', () => {
    expect(
      [
        ...getQueryStatusSectionStatuses('Running'),
        ...getQueryStatusSectionStatuses('Stopped'),
      ].sort()
    ).toEqual([...ALL_QUERY_STATUSES].sort());
  });
});
