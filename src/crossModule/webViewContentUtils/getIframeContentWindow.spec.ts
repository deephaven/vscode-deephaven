import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getIframeContentWindow } from './getIframeContentWindow';
import { CONTENT_IFRAME_ID } from '../constants';

// @vitest-environment jsdom

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getIframeContentWindow', () => {
  it('should return the content window of the iframe', () => {
    const iframeEl = document.createElement('iframe');
    iframeEl.id = CONTENT_IFRAME_ID;
    document.body.appendChild(iframeEl);

    const contentWindow = iframeEl.contentWindow;
    expect(contentWindow).toBeDefined();

    expect(getIframeContentWindow()).toBe(contentWindow);
  });

  it('should throw an error if the iframe is not found', () => {
    expect(() => getIframeContentWindow()).toThrowError(
      `Iframe with id ${CONTENT_IFRAME_ID} not found`
    );
  });

  it('should throw an error if the element is not an iframe', () => {
    const divEl = document.createElement('div');
    divEl.id = CONTENT_IFRAME_ID;
    document.body.appendChild(divEl);

    expect(() => getIframeContentWindow()).toThrowError(
      'Element is not an iframe'
    );
  });

  it('should throw an error if the iframe content window is not defined', () => {
    const iframeEl = document.createElement('iframe');
    iframeEl.id = CONTENT_IFRAME_ID;
    document.body.appendChild(iframeEl);

    vi.spyOn(iframeEl, 'contentWindow', 'get').mockReturnValue(null);

    expect(() => getIframeContentWindow()).toThrowError(
      'iframe content window'
    );
  });
});
