export function getPanelHtml(iframeUrl: string, title: string) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Deephaven</title>
      <style>
      html, body {
        height: 100%;
        overflow: hidden;
      }
      iframe {
        border: none;
        width: 100%;
        height: 100%;
      }
      </style>
  </head>
  <body>
      <script>
      (function() {
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', ({ data }) => {
          if (data.message === 'io.deephaven.message.LoginOptions.request') {
            console.log('LoginOptions request received from iframe', data);
            vscode.postMessage({ data });
            return;
          }

          if (data.message === 'io.deephaven.message.SessionDetails.request') {
            console.log('SessionDetails request received from iframe', data);
            vscode.postMessage({ data });
            return;
          }

          if (data.message === 'vscode-ext.loginOptions') {
            console.log('Received login message from ext', data);
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          if (data.message === 'vscode-ext.sessionDetails') {
            console.log('Received session message from ext', data);
            const iframeWindow = document.getElementById('content-iframe').contentWindow;
            iframeWindow.postMessage(data.payload, data.targetOrigin);
            return;
          }

          console.log('Unknown message type', data);
        });
      }())
      </script>
      <iframe id="content-iframe" src="${iframeUrl}&cachebust=${new Date().getTime()}" title="${title}"></iframe>
  </body>
  </html>`;
}
