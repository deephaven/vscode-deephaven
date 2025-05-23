import { it, expect, vi, beforeEach } from 'vitest';
import { getExternalThemeData } from './getExternalThemeData';

// @vitest-environment jsdom

const mockResolver = {
  getPropertyValue: vi.fn(),
} as unknown as CSSStyleDeclaration;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(mockResolver);
});

it.each([
  ['default-dark', ''],
  ['default-light', ''],
  ['default-dark', 'red'],
  ['default-light', 'red'],
] as const)(
  'should get external theme based on vscode theme colors: %s, %s',
  (baseThemeKey, sidebarBg) => {
    vi.mocked(mockResolver.getPropertyValue).mockReturnValue(sidebarBg);

    const actual = getExternalThemeData(baseThemeKey);

    expect(window.getComputedStyle).toHaveBeenCalledWith(
      document.documentElement
    );
    expect(mockResolver.getPropertyValue).toHaveBeenCalledWith(
      '--vscode-sideBar-background'
    );

    expect(actual).toEqual({
      baseThemeKey,
      cssVars: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        '--dh-color-bg': sidebarBg || 'transparent',
      },
      name: 'Iframe External Theme',
    });
  }
);
