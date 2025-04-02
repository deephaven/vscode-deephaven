import * as vscode from 'vscode';
import { vi, it, expect, beforeEach } from 'vitest';
import { ParsedDocumentCache } from './ParseDocumentCache';
import { mockDocument, mockT } from '../util';

vi.mock('vscode');

interface MockParsedDocument {
  label: `mock.parsed.${string}`;
}

const mockDock = {
  av1: mockDocument('fileA', 1),
  av2: mockDocument('fileA', 2),
  parseDocument: (document: vscode.TextDocument): MockParsedDocument =>
    ({
      label: `mock.parsed.${document.fileName}`,
    }) as MockParsedDocument,
};

const mockEvent = {
  av1: mockT<vscode.TextDocumentChangeEvent>({
    document: mockDock.av1,
  }),
  av2: mockT<vscode.TextDocumentChangeEvent>({
    document: mockDock.av2,
  }),
};

const parseDocument =
  vi.fn<(document: vscode.TextDocument) => MockParsedDocument>();

function initializeCache(initialCachedDoc?: vscode.TextDocument): {
  cache: ParsedDocumentCache<MockParsedDocument>;
  changeHandler: (e: vscode.TextDocumentChangeEvent) => any;
  closeHandler: (e: vscode.TextDocument) => any;
} {
  const cache = new ParsedDocumentCache(parseDocument);

  const { changeHandler, closeHandler } = getHandlers();

  if (initialCachedDoc != null) {
    const actual = cache.get(initialCachedDoc);
    expect(parseDocument).toHaveBeenCalledWith(initialCachedDoc);
    expect(actual).toEqual(mockDock.parseDocument(initialCachedDoc));
  }

  return { cache, changeHandler, closeHandler };
}

function getHandlers(): {
  changeHandler: (e: vscode.TextDocumentChangeEvent) => any;
  closeHandler: (e: vscode.TextDocument) => any;
} {
  const changeHandler = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock
    .calls[0][0];

  const closeHandler = vi.mocked(vscode.workspace.onDidCloseTextDocument).mock
    .calls[0][0];

  return {
    changeHandler,
    closeHandler,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  parseDocument.mockImplementation(mockDock.parseDocument);
});

it('should re-cache if document changed to newer version or explicitly requested', () => {
  const { cache, changeHandler } = initializeCache(mockDock.av1);

  // Document changed to newer version
  vi.clearAllMocks();
  changeHandler(mockEvent.av2);
  expect(parseDocument).toHaveBeenCalledWith(mockDock.av2);
  expect(cache.get(mockDock.av2)).toEqual(mockDock.parseDocument(mockDock.av2));

  // Document changed to older version
  vi.clearAllMocks();
  changeHandler(mockEvent.av1);
  expect(parseDocument).not.toHaveBeenCalled();

  expect(cache.get(mockDock.av1)).toEqual(mockDock.parseDocument(mockDock.av1));
  expect(parseDocument).toHaveBeenCalledWith(mockDock.av1);
});

it('should clear cache on document close', () => {
  const { cache, closeHandler } = initializeCache(mockDock.av1);

  expect(parseDocument).toHaveBeenCalledWith(mockDock.av1);

  // Request cached version
  vi.clearAllMocks();
  cache.get(mockDock.av1);
  expect(parseDocument).not.toHaveBeenCalled();

  // Close document and request a again
  closeHandler(mockDock.av1);
  cache.get(mockDock.av1);
  expect(parseDocument).toHaveBeenCalledWith(mockDock.av1);
});
