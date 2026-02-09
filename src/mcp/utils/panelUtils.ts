import type { IServerManager, Psk } from '../../types';

/**
 * Gets the panel URL format for DHC servers.
 * DHC servers use iframe format.
 *
 * @param serverUrl The server URL to use for the panel URL origin.
 * @param psk Optional pre-shared key to include in the URL.
 * @returns The panel URL format for DHC servers.
 */
export function getDhcPanelUrlFormat(serverUrl: URL, psk?: Psk): string {
  const url = `${serverUrl.origin}/iframe/widget/?name=<variableTitle>`;
  return psk ? `${url}&psk=${psk}` : url;
}

/**
 * Gets the panel URL format for DHE servers.
 * DHE servers use iriside format with serial ID.
 *
 * @param serverUrl The server URL to use for the panel URL origin.
 * @param connectionUrl The connection URL to get worker info for.
 * @param serverManager The server manager to query for DHE service and worker info.
 * @returns The panel URL format for DHE servers, or undefined if serial is not available.
 */
export async function getDhePanelUrlFormat(
  serverUrl: URL,
  connectionUrl: URL,
  serverManager: IServerManager
): Promise<string | undefined> {
  const dheService = await serverManager.getDheServiceForWorker(connectionUrl);

  const features = dheService?.getServerFeatures()?.features;
  if (features?.embedDashboardsAndWidgets !== true) {
    return undefined;
  }

  // Get worker info for DHE servers to include serial ID in panel URLs
  const workerInfo = await serverManager.getWorkerInfo(connectionUrl);
  if (workerInfo == null) {
    return undefined;
  }

  return `${serverUrl.origin}/iriside/embed/widget/serial/${workerInfo.serial}/<variableTitle>`;
}
