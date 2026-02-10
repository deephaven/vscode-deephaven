import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createSetEditorConnectionTool } from './setEditorConnection';
import type { IServerManager, ConnectionState, UniqueID } from '../../types';
import {
  fakeMcpToolTimings,
  mcpErrorResult,
  mcpSuccessResult,
} from '../utils/mcpTestUtils';

vi.mock('vscode');

const MOCK_CONNECTION: ConnectionState = {
  serverUrl: new URL('http://localhost:10000'),
  isConnected: true,
  isRunningCode: false,
  tagId: 'conn1' as UniqueID,
} as const;

const MOCK_URI = 'file:///path/to/file.py';
const MOCK_CONNECTION_URL = 'http://localhost:10000';

describe('setEditorConnection', () => {
  const serverManager = {
    getConnections: vi.fn(),
    setEditorConnection: vi.fn(),
  } as unknown as IServerManager;

  const mockTextDocument = {
    languageId: 'python',
  } as vscode.TextDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeMcpToolTimings();

    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(
      mockTextDocument
    );
    vi.mocked(serverManager.setEditorConnection).mockResolvedValue();
  });

  it('should return correct tool spec', () => {
    const tool = createSetEditorConnectionTool({ serverManager });

    expect(tool.name).toBe('setEditorConnection');
    expect(tool.spec.title).toBe('Set Editor Connection');
    expect(tool.spec.description).toBe(
      'Set the connection for a given editor by URI and connection URL.'
    );
  });

  it('should set editor connection successfully', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);

    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(vscode.Uri.parse).toHaveBeenCalledWith(MOCK_URI);
    expect(serverManager.getConnections).toHaveBeenCalledWith(
      new URL(MOCK_CONNECTION_URL)
    );
    expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    expect(serverManager.setEditorConnection).toHaveBeenCalledWith(
      expect.anything(),
      'python',
      MOCK_CONNECTION
    );

    expect(result.structuredContent).toEqual(
      mcpSuccessResult('Editor connection set successfully', {
        uri: MOCK_URI,
        connectionUrl: MOCK_CONNECTION_URL,
      })
    );
  });

  it('should handle groovy language', async () => {
    const groovyDoc = { languageId: 'groovy' } as vscode.TextDocument;
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue(groovyDoc);
    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);

    const tool = createSetEditorConnectionTool({ serverManager });
    await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(serverManager.setEditorConnection).toHaveBeenCalledWith(
      expect.anything(),
      'groovy',
      MOCK_CONNECTION
    );
  });

  it('should use first connection when multiple are available', async () => {
    const connection2: ConnectionState = {
      ...MOCK_CONNECTION,
      tagId: 'conn2' as UniqueID,
    };
    vi.mocked(serverManager.getConnections).mockReturnValue([
      MOCK_CONNECTION,
      connection2,
    ]);

    const tool = createSetEditorConnectionTool({ serverManager });
    await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(serverManager.setEditorConnection).toHaveBeenCalledWith(
      expect.anything(),
      'python',
      MOCK_CONNECTION
    );
  });

  it('should handle invalid URL', async () => {
    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: MOCK_URI,
      connectionUrl: 'invalid-url',
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Invalid URL: Invalid URL', {
        connectionUrl: 'invalid-url',
      })
    );
    expect(serverManager.getConnections).not.toHaveBeenCalled();
  });

  it('should handle no active connection', async () => {
    vi.mocked(serverManager.getConnections).mockReturnValue([]);

    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult(
        'No active connection for the given URL',
        { connectionUrl: MOCK_CONNECTION_URL },
        'Use connectToServer to establish a connection first'
      )
    );
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('should handle document open error', async () => {
    const error = new Error('Failed to open document');
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(error);
    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);

    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult(
        'Failed to set editor connection: Failed to open document',
        {
          uri: MOCK_URI,
          connectionUrl: MOCK_CONNECTION_URL,
        }
      )
    );
  });

  it('should handle setEditorConnection error', async () => {
    const error = new Error('Connection failed');
    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);
    vi.mocked(serverManager.setEditorConnection).mockRejectedValue(error);

    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: MOCK_URI,
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to set editor connection: Connection failed', {
        uri: MOCK_URI,
        connectionUrl: MOCK_CONNECTION_URL,
      })
    );
  });

  it('should handle URI parse error', async () => {
    const error = new Error('Invalid URI');
    vi.mocked(vscode.Uri.parse).mockImplementation(() => {
      throw error;
    });
    vi.mocked(serverManager.getConnections).mockReturnValue([MOCK_CONNECTION]);

    const tool = createSetEditorConnectionTool({ serverManager });
    const result = await tool.handler({
      uri: 'invalid-uri',
      connectionUrl: MOCK_CONNECTION_URL,
    });

    expect(result.structuredContent).toEqual(
      mcpErrorResult('Failed to set editor connection: Invalid URI', {
        uri: 'invalid-uri',
        connectionUrl: MOCK_CONNECTION_URL,
      })
    );
  });
});
