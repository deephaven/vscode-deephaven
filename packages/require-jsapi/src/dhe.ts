import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EnterpriseDhType as DheType,
  EditableQueryInfo,
  EnterpriseClient,
} from '@deephaven-enterprise/jsapi-types';
import { polyfillDh } from './polyfill';
import { downloadFromURL, hasStatusCode } from './serverUtils';

/**
 * Check if a given server is running by checking if the `irisapi/irisapi.nocache.js`
 * file is accessible.
 * @param serverUrl
 */
export async function isDheServerRunning(serverUrl: URL): Promise<boolean> {
  try {
    return await hasStatusCode(
      new URL('irisapi/irisapi.nocache.js', serverUrl.toString()),
      [200, 204]
    );
  } catch {
    return false;
  }
}

export async function createDheClient(
  dhe: DheType,
  serverUrl: URL
): Promise<EnterpriseClient> {
  const dheClient = new dhe.Client(serverUrl.toString());

  return new Promise(resolve => {
    const unsubscribe = dheClient.addEventListener(
      dhe.Client.EVENT_CONNECT,
      () => {
        unsubscribe();
        resolve(dheClient);
      }
    );
  });
}

export async function initDheApi(
  serverUrl: URL,
  storageDir: string
): Promise<DheType> {
  polyfillDh();
  return getDhe(serverUrl, true, storageDir);
}

declare global {
  export const iris: DheType;
}

export async function getDhe(
  serverUrl: URL,
  download: boolean,
  storageDir: string
): Promise<DheType> {
  const dheFilePath = path.join(storageDir, 'irisapi.nocache.js');

  if (download) {
    const dhe = await downloadFromURL(
      path.join(serverUrl.toString(), 'irisapi/irisapi.nocache.js')
    );

    fs.writeFileSync(dheFilePath, dhe);
  }

  require(dheFilePath);

  return iris;
}

export async function getDheAuthToken(
  client: EnterpriseClient
): Promise<{ type: string; token: string }> {
  const token = await client.createAuthToken('RemoteQueryProcessor');
  return {
    type: 'io.deephaven.proto.auth.Token',
    token,
  };
}

export function getWsUrl(serverUrl: URL): URL {
  const url = new URL('/socket', serverUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    url.protocol = 'wss:';
  }
  return url;
}

export function defaultDraftQuery(
  config: { owner: string } & Partial<EditableQueryInfo>
): EditableQueryInfo {
  return {
    id: randomUUID(),
    type: 'Script',
    isModified: false,
    isClientSide: true,
    draftOwner: config.owner,
    serial: null,
    name: 'Untitled',
    enabled: true,
    enableGcLogs: true,
    envVars: '',
    heapSize: 4,
    additionalMemory: 0,
    dataMemoryRatio: 0.25,
    jvmArgs: '',
    extraClasspaths: '',
    jvmProfile: 'Default',
    dbServerName: 'AutoQuery',
    scriptLanguage: 'Groovy',
    scriptPath: null,
    scriptCode: '',
    adminGroups: [],
    viewerGroups: [],
    restartUsers: 1,
    timeout: 0,
    workerKind: 'DeephavenCommunity',
    typeSpecificFields: null,
    replicaCount: 1,
    spareCount: 0,
    assignmentPolicy: null,
    assignmentPolicyParams: null,
    scheduling: [
      'SchedulerType=com.illumon.iris.controller.IrisQuerySchedulerDaily',
      'Calendar=USNYSE',
      'BusinessDays=false',
      'Days=true=true=true=true=true=true=true',
      'StartTime=07:55:00',
      'StopTime=23:55:00',
      'TimeZone=America/New_York',
      'SchedulingDisabled=false',
      'Overnight=false',
      'RepeatEnabled=false',
      'SkipIfUnsuccessful=false',
      'StopTimeDisabled=false',
      'RestartErrorCount=0',
      'RestartErrorDelay=0',
      'RestartWhenRunning=Yes',
    ],
    scheduler: {
      type: 'com.illumon.iris.controller.IrisQuerySchedulerDaily',
      startTimeInternal: 28500,
      stopTimeInternal: 86100,
      timeZone: 'America/New_York',
      schedulingDisabled: false,
      overnightInternal: false,
      repeatEnabled: false,
      stopTimeDisabledInternal: false,
      repeatInterval: 0,
      skipIfUnsuccessful: false,
      restartErrorCount: 0,
      restartDelayMinutes: 0,
      restartWhenRunning: 'Yes',
      businessDays: false,
      dailyBusinessCalendar: 'USNYSE',
      dailyDays: [true, true, true, true, true, true, true],
      firstBusinessDay: false,
      lastBusinessDay: false,
      specificDays: true,
      months: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      monthlyDays: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      monthlyBusinessCalendar: 'USNYSE',
      dailyRestart: false,
      runOnFailure: false,
      restartOnCondition: false,
      dependentOnQuerySerials: [],
      useMinStartTime: false,
      runOnAny: false,
      deadlineStartTime: 0,
      deadlineEndTime: 86399,
      runEveryTime: false,
      temporaryQueueName: '',
      expirationTimeMillis: 86400000,
      temporaryDependentOnQuerySerials: [],
      startDateTime: null,
      stopDateTime: null,
    },
    ...config,
  } as any;
}
