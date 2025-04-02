import * as vscode from 'vscode';
import { vi, it, expect, beforeEach } from 'vitest';
import { ParsedDocumentCache } from './ParseDocumentCache';
import { mockDocument, mockT } from '../util';

vi.mock('vscode');

interface MockParsedDocument {
  label: `mock.parsed.${string}`;
}

// vscode.TextDocument mocks
const mockDoc = {
  av1: mockDocument('fileA', 1),
  av2: mockDocument('fileA', 2),
  parseDocument: (document: vscode.TextDocument): MockParsedDocument =>
    ({
      label: `mock.parsed.${document.fileName}`,
    }) as MockParsedDocument,
};

// Event handler mocks
const mockEvent = {
  av1: mockT<vscode.TextDocumentChangeEvent>({
    document: mockDoc.av1,
  }),
  av2: mockT<vscode.TextDocumentChangeEvent>({
    document: mockDoc.av2,
  }),
};

// Mock document parser
const mockParseDocument =
  vi.fn<(document: vscode.TextDocument) => MockParsedDocument>();

/**
 * Initialize a ParseDocumentCache. Optionally request a document to initialize
 * internal caches.
 */
function initializeCache(initialCachedDoc?: vscode.TextDocument): {
  cache: ParsedDocumentCache<MockParsedDocument>;
  changeHandler: (e: vscode.TextDocumentChangeEvent) => any;
  closeHandler: (e: vscode.TextDocument) => any;
} {
  const cache = new ParsedDocumentCache(mockParseDocument);

  const { changeHandler, closeHandler } = getHandlers();

  if (initialCachedDoc != null) {
    const actual = cache.get(initialCachedDoc);
    expect(mockParseDocument).toHaveBeenCalledWith(initialCachedDoc);
    expect(actual).toEqual(mockDoc.parseDocument(initialCachedDoc));
  }

  return { cache, changeHandler, closeHandler };
}

/**
 * Get registered event handlers that are set by ParseDocumentCache constructor.
 */
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
  mockParseDocument.mockImplementation(mockDoc.parseDocument);
});

it('should re-cache if document changed to newer version or explicitly requested', () => {
  const { cache, changeHandler } = initializeCache(mockDoc.av1);

  // Document changed to newer version
  vi.clearAllMocks();
  changeHandler(mockEvent.av2);
  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.av2);
  expect(cache.get(mockDoc.av2)).toEqual(mockDoc.parseDocument(mockDoc.av2));

  // Document changed to older version
  vi.clearAllMocks();
  changeHandler(mockEvent.av1);
  expect(mockParseDocument).not.toHaveBeenCalled();

  expect(cache.get(mockDoc.av1)).toEqual(mockDoc.parseDocument(mockDoc.av1));
  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.av1);
});

it('should clear cache on document close', () => {
  const { cache, closeHandler } = initializeCache(mockDoc.av1);

  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.av1);

  // Request cached version
  vi.clearAllMocks();
  cache.get(mockDoc.av1);
  expect(mockParseDocument).not.toHaveBeenCalled();

  // Close document and request a again
  closeHandler(mockDoc.av1);
  cache.get(mockDoc.av1);
  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.av1);
});
