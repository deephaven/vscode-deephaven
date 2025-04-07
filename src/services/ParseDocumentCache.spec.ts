import * as vscode from 'vscode';
import { vi, it, expect, beforeEach } from 'vitest';
import { ParsedDocumentCache } from './ParseDocumentCache';
import { mockDocument } from '../util';

vi.mock('vscode');

interface MockParsedDocument {
  label: `mock.parsed.${string}`;
}

// vscode.TextDocument mocks
const mockDoc = {
  av1: mockDocument('fileA', 1),
  av2: mockDocument('fileA', 2),
  bv1: mockDocument('fileB', 1),
  bv2: mockDocument('fileB', 2),
  parseDocument: (document: vscode.TextDocument): MockParsedDocument =>
    ({
      label: `mock.parsed.${document.fileName}`,
    }) as MockParsedDocument,
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
  closeHandler: (e: vscode.TextDocument) => any;
} {
  const cache = new ParsedDocumentCache(mockParseDocument);

  const closeHandler = vi.mocked(vscode.workspace.onDidCloseTextDocument).mock
    .calls[0][0];

  if (initialCachedDoc != null) {
    const actual = cache.get(initialCachedDoc);
    expect(mockParseDocument).toHaveBeenCalledWith(initialCachedDoc);
    expect(actual).toEqual(mockDoc.parseDocument(initialCachedDoc));
  }

  return { cache, closeHandler };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockParseDocument.mockImplementation(mockDoc.parseDocument);
});

it('should cache on doc uri + version', () => {
  const { cache } = initializeCache(mockDoc.av1);

  // Same doc + version
  vi.clearAllMocks();
  let actual = cache.get(mockDoc.av1);
  expect(mockParseDocument).not.toHaveBeenCalled();
  expect(actual).toEqual(mockDoc.parseDocument(mockDoc.av1));

  // Change version
  vi.clearAllMocks();
  actual = cache.get(mockDoc.av2);
  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.av2);
  expect(actual).toEqual(mockDoc.parseDocument(mockDoc.av2));

  // Change doc
  vi.clearAllMocks();
  actual = cache.get(mockDoc.bv2);
  expect(mockParseDocument).toHaveBeenCalledWith(mockDoc.bv2);
  expect(actual).toEqual(mockDoc.parseDocument(mockDoc.bv2));

  // Change back to previous doc
  vi.clearAllMocks();
  actual = cache.get(mockDoc.av2);
  expect(mockParseDocument).not.toHaveBeenCalledWith(mockDoc.av2);
  expect(actual).toEqual(mockDoc.parseDocument(mockDoc.av2));
});

it('should remove document from cache on close', () => {
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
