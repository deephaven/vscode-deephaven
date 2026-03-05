/**
 * Deephaven Panel UI Template for MCP Apps Extension
 *
 * This generates the HTML for the Deephaven panel UI that can be rendered
 * in a sandboxed iframe by MCP hosts that support the Apps Extension (SEP-1865).
 *
 * Communication with the host happens via postMessage using MCP JSON-RPC.
 *
 * MCP Apps Protocol Lifecycle (SEP-1865):
 * 1. UI sends ui/initialize request to host
 * 2. Host responds with McpUiInitializeResult containing host context and styles
 * 3. UI sends ui/notifications/initialized notification to host
 * 4. Host sends ui/notifications/tool-input with the tool arguments (panel configuration)
 * 5. Host sends ui/notifications/tool-result when tool completes (optional)
 * 6. UI can send ui/message to add content to chat input (for user interaction)
 *
 * Expected parameters in tool-input:
 * - connectionUrl: Deephaven connection URL
 * - variableId: Variable ID to display
 * - variableTitle: Variable display title
 * - variableType: Type of variable (Table, Figure, etc.)
 * - panelUrl: Full URL to embed (constructed from panelUrlFormat)
 */

/**
 * Generate the Deephaven Panel UI HTML template.
 * The panel data comes via ui/notifications/tool-input (arguments) and
 * ui/notifications/tool-result (structuredContent.details.panelUrl).
 * @returns HTML string for the Deephaven panel UI
 */
export function DEEPHAVEN_PANEL_UI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src *;">
  <title>Deephaven Panel</title>
  <style>
    /* Use VS Code theme variables for consistent theming */
    :root {
      --vscode-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --vscode-bg: #1e1e1e;
      --vscode-text: #cccccc;
      --vscode-text-muted: #6e7681;
      --vscode-border: #454545;
      --vscode-input-bg: #3c3c3c;
      --vscode-input-border: #454545;
      --vscode-button-bg: #0e639c;
      --vscode-button-hover: #1177bb;
      --vscode-error: #f48771;
      --vscode-success: #89d185;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font);
      font-size: 13px;
      background: var(--vscode-bg);
      color: var(--vscode-text);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-border);
      background: var(--vscode-bg);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-icon {
      font-size: 16px;
    }

    .panel-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-text);
    }

    .panel-subtitle {
      font-size: 11px;
      color: var(--vscode-text-muted);
      margin-left: 4px;
    }

    .status {
      font-size: 11px;
      color: var(--vscode-text-muted);
      padding: 2px 8px;
      border-radius: 3px;
    }

    .status.success {
      color: var(--vscode-success);
    }

    .status.error {
      color: var(--vscode-error);
    }

    .panel-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .panel-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--vscode-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
    }

    .loading-overlay.hidden {
      display: none;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--vscode-border);
      border-top-color: var(--vscode-button-bg);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      max-width: 400px;
      padding: 12px;
      background: var(--vscode-input-bg);
      border: 1px solid var(--vscode-error);
      border-radius: 4px;
      color: var(--vscode-error);
      text-align: center;
    }

    .error-details {
      margin-top: 8px;
      font-size: 11px;
      color: var(--vscode-text-muted);
    }
  </style>
</head>
<body>
  <!-- Header showing panel information and status -->
  <div class="header">
    <div class="header-left">
      <span class="header-icon">📊</span>
      <span class="panel-title" id="panelTitle">Deephaven Panel</span>
      <span class="panel-subtitle" id="panelSubtitle"></span>
    </div>
    <div class="status" id="status">Initializing...</div>
  </div>

  <!-- Panel container with iframe -->
  <div class="panel-container">
    <div class="loading-overlay hidden" id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingMessage">Connecting to Deephaven...</div>
    </div>
    <iframe 
      id="panelIframe" 
      class="panel-iframe" 
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" 
      style="display: none;"
    ></iframe>
  </div>

  <script>
    // ============================================
    // MCP Apps Extension (SEP-1865) Implementation
    // ============================================

    let nextRequestId = 1;
    const pendingRequests = new Map();
    let hostContext = null;
    let isInitialized = false;
    let panelConfig = null;

    // Generate unique request ID
    function generateId() {
      return nextRequestId++;
    }

    // Send JSON-RPC request to host and return promise
    function sendRequest(method, params) {
      const id = generateId();
      const request = {
        jsonrpc: '2.0',
        id: id,
        method: method,
        params: params || {}
      };

      console.log('Sending request to parent:', method);
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        window.parent.postMessage(request, '*');
      });
    }

    // Send JSON-RPC notification to host (no response expected)
    function sendNotification(method, params) {
      const notification = {
        jsonrpc: '2.0',
        method: method,
        params: params || {}
      };
      console.log('Sending notification to parent:', method);
      window.parent.postMessage(notification, '*');
    }

    // Listen for messages from host and iframe
    window.addEventListener('message', (event) => {
      try {
        const message = event.data;
        const iframe = document.getElementById('panelIframe');

        // Check if message is from the nested iframe (Deephaven widget)
        if (event.source === iframe?.contentWindow) {
          console.log('Message received from Deephaven iframe:', JSON.stringify(message, null, 2));
          
          // Handle JSON-RPC error responses
          if (message.jsonrpc === '2.0' && message.error) {
            console.log('Forwarding JSON-RPC error response from iframe to chat via ui/message');
            const { code, message: errorMsg, data } = message.error;
            
            let errorText = errorMsg || 'Unknown error';
            
            // If error.data is an array with nested errors, format them
            if (Array.isArray(data) && data.length > 0) {
              const nestedErrors = data
                .map(err => err.message || JSON.stringify(err))
                .join('\\n');
              errorText = \`\${errorText}\\n\${nestedErrors}\`;
            } else if (data) {
              errorText = \`\${errorText}\\n\${JSON.stringify(data)}\`;
            }
            
            // Send to chat as ui/message request (per SEP-1865 spec)
            sendRequest('ui/message', {
              role: 'user',
              content: {
                type: 'text',
                text: \`**Error** (Code \${code}): \${errorText}\`
              }
            }).catch(error => {
              console.error('Failed to send error to chat:', error instanceof Error ? error.message : String(error));
            });
            return;
          }
          
          // Forward error notifications from Deephaven iframe to chat via ui/message request
          if (message.jsonrpc === '2.0' && message.method === 'notifications/message') {
            console.log('Forwarding notification from iframe to parent');
            window.parent.postMessage(message, '*');
          }
          return;
        }

        console.log('Message received from parent:', JSON.stringify(message, null, 2));

        // Handle responses to our requests
        if (message.id && (message.result || message.error)) {
          const pending = pendingRequests.get(message.id);
          if (pending) {
            pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message || 'Unknown error'));
            } else {
              pending.resolve(message.result);
            }
          }
          return;
        }

        // Handle notifications from host
        if (message.method) {
          handleHostNotification(message.method, message.params);
        }
      } catch (error) {
        console.error('Error handling message:', error instanceof Error ? error.message : JSON.stringify(error));
      }
    });

    // Handle notifications from the host
    function handleHostNotification(method, params) {
      switch (method) {
        case 'ui/notifications/tool-input-partial':
          // Optional: Handle streaming tool input (partial updates)
          console.log('Partial tool input received:', JSON.stringify(params, null, 2));
          if (params?.arguments) {
            updatePanelConfig(params.arguments, true);
          }
          break;

        case 'ui/notifications/tool-input':
          // Complete tool arguments received
          console.log('Tool input received:', JSON.stringify(params, null, 2));
          if (params?.arguments) {
            panelConfig = params.arguments;
            updatePanelConfig(params.arguments, false);
            // Don't call loadPanel yet - wait for tool-result with panelUrl
          }
          updateStatus('Loading panel...', false);
          break;

        case 'ui/notifications/tool-result':
          // Tool execution completed - extract panelUrl from structuredContent
          console.log('Tool result received:', JSON.stringify(params, null, 2));
          if (params?.isError) {
            showError('Panel loading failed', params.result?.toString());
          } else {
            // Extract panelUrl and other details from structuredContent
            const structuredContent = params.structuredContent;
            console.log('structuredContent:', JSON.stringify(structuredContent, null, 2));
            if (structuredContent?.details) {
              console.log('Extracted details from tool result:', structuredContent.details);
              if (panelConfig) {
                // Merge all details from tool result into panelConfig
                panelConfig = {
                  ...panelConfig,
                  ...structuredContent.details
                };
                console.log('Updated panelConfig with tool result details, calling loadPanel...');
                updatePanelConfig(panelConfig, false);
                loadPanel(panelConfig);
              } else {
                console.error('panelConfig is null, cannot load panel');
              }
            } else {
              console.error('No details found in structuredContent:', structuredContent);
            }
            updateStatus('Panel loaded', true);
          }
          break;

        default:
          console.log('Unknown notification:', method, JSON.stringify(params, null, 2));
      }
    }

    // Apply host styles and context
    function applyHostStyles() {
      if (!hostContext?.styles?.css?.variables) {
        return;
      }

      const root = document.documentElement;
      const variables = hostContext.styles.css.variables;

      // Apply CSS variables from host
      for (const [key, value] of Object.entries(variables)) {
        if (value) {
          root.style.setProperty(key, value);
        }
      }

      // Apply custom fonts if provided
      if (hostContext.styles?.css?.fonts) {
        const style = document.createElement('style');
        style.textContent = hostContext.styles.css.fonts;
        document.head.appendChild(style);
      }
    }

    // Update panel configuration display
    function updatePanelConfig(config, isPartial) {
      if (config.variableTitle) {
        document.getElementById('panelTitle').textContent = config.variableTitle;
      }
      if (config.variableType) {
        document.getElementById('panelSubtitle').textContent = '(' + config.variableType + ')';
      }
      if (!isPartial && config.connectionUrl) {
        document.title = (config.variableTitle || 'Panel') + ' - Deephaven';
      }
    }

    // Load the Deephaven panel in iframe
    function loadPanel(config) {
      // panelUrl comes from structuredContent.details.panelUrl in tool result
      let { panelUrl, connectionUrl, variableId, variableTitle, variableType } = config;

      console.log('Loading panel with config:', JSON.stringify({ panelUrl, connectionUrl, variableId, variableTitle, variableType }, null, 2));

      if (!panelUrl) {
        showError('Missing panel URL', 'Panel URL is required to load the widget');
        return;
      }

      const iframe = document.getElementById('panelIframe');
      const loadingOverlay = document.getElementById('loadingOverlay');

      // Update loading message and show overlay
      document.getElementById('loadingMessage').textContent = \`Loading \${variableTitle || 'panel'}...\`;
      loadingOverlay.classList.remove('hidden');

      // Set up iframe load handlers
      iframe.onload = async () => {
        console.log('iframe onload fired');
        loadingOverlay.classList.add('hidden');
        iframe.style.display = 'block';
        updateStatus('Connected', true);

        // Notify host that panel is ready
        sendNotification('ui/notifications/panel-ready', {
          variableId,
          variableTitle,
          variableType,
          connectionUrl
        });
      };

      iframe.onerror = () => {
        console.log('iframe onerror fired');
        showError('Failed to load panel', 'Could not connect to Deephaven server');
      };

      // Load the panel URL
      console.log('Setting iframe.src to:', panelUrl);
      iframe.src = panelUrl;
    }

    // Show error message
    function showError(message, details) {
      const loadingOverlay = document.getElementById('loadingOverlay');
      loadingOverlay.innerHTML = \`
        <div class="error-message">
          <div>\${escapeHtml(message)}</div>
          \${details ? \`<div class="error-details">\${escapeHtml(details)}</div>\` : ''}
        </div>
      \`;
      loadingOverlay.classList.remove('hidden');
      updateStatus('Error', false);
      document.getElementById('status').classList.add('error');
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Update status message
    function updateStatus(message, isSuccess) {
      const statusEl = document.getElementById('status');
      statusEl.textContent = message;
      statusEl.className = 'status' + (isSuccess ? ' success' : '');
    }

    // ============================================
    // Initialization (SEP-1865 Lifecycle)
    // ============================================

    async function initialize() {
      try {
        updateStatus('Connecting to host...', false);

        // 1. Send ui/initialize request to host
        const initResult = await sendRequest('ui/initialize', {
          protocolVersion: '1.0.0',
          capabilities: {
            streaming: true,
            notifications: true
          }
        });

        console.log('Initialization result:', JSON.stringify(initResult, null, 2));
        hostContext = initResult;

        // Apply host styles and theme
        applyHostStyles();

        // 2. Send ui/notifications/initialized notification
        sendNotification('ui/notifications/initialized', {
          ready: true
        });

        isInitialized = true;
        updateStatus('Waiting for panel data...', false);

      } catch (error) {
        console.error('Initialization failed:', error instanceof Error ? error.message : JSON.stringify(error));
        showError('Initialization failed', error instanceof Error ? error.message : String(error));
      }
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }
  </script>
</body>
</html>`;
}
