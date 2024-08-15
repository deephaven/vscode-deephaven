/* eslint-disable @typescript-eslint/naming-convention */
import { expect } from '@wdio/globals';
import { getConfig, resetConfig, setConfigSectionSettings } from '../testUtils';

afterEach(async () => {
  await resetConfig();
});

describe('Extension config testing', () => {
  it('should default to the correct settings', async () => {
    const config = await getConfig();

    expect(config).toStrictEqual({
      'core-servers': ['http://localhost:10000/'],
      'enterprise-servers': [],
    });
  });

  (
    [
      ['Empty configs', [], []],
      [
        'Populated configs',
        ['core-a', 'core-b'],
        ['enterprise-a', 'enterprise-b'],
      ],
    ] as const
  ).forEach(([label, coreServers, enterpriseServers]) => {
    it(`should return custom settings: ${label}`, async () => {
      await setConfigSectionSettings('core-servers', coreServers);
      await setConfigSectionSettings('enterprise-servers', enterpriseServers);

      const config = await getConfig();

      expect(config).toStrictEqual({
        'core-servers': coreServers,
        'enterprise-servers': enterpriseServers,
      });
    });
  });
});
