/* eslint-disable @typescript-eslint/naming-convention */
import Log from '@deephaven/log';
import { TimeUtils } from '@deephaven/utils';
import {
  CalendarDateTime,
  parseDateTime,
  toCalendarDate,
  toTime,
} from '@internationalized/date';

const log = Log.module('QueryScheduler');

const DEFAULT_CALENDAR = 'USNYSE';

const DEFAULT_EXPIRATION_TIME_MILLIS = 24 * 60 * 60 * 1000;

const DEFAULT_TIME_ZONE = 'America/New_York';

/**
 * QueryScheduler is the client side equivalent of the server side class IrisScheduler.
 *
 * The server stores scheduling data as an array of Strings.  This class converts that array
 * into an object that can be manipulated by the UI.  It then converts back to an array for
 * storage on the server.
 */
class QueryScheduler {
  type: string;

  // Base Fields
  startTimeInternal: number;

  stopTimeInternal: number;

  timeZone: string;

  schedulingDisabled: boolean;

  overnightInternal: boolean;

  repeatEnabled: boolean;

  stopTimeDisabledInternal: boolean;

  repeatInterval: number;

  skipIfUnsuccessful: boolean;

  restartErrorCount: number;

  restartDelayMinutes: number;

  // TODO: use queryScheduler.restartWhenRunningDefault as the default, DH-11582
  restartWhenRunning: string;

  // Daily Fields
  businessDays: boolean;

  dailyBusinessCalendar: string;

  dailyDays: boolean[];

  // Monthly Fields
  firstBusinessDay: boolean;

  lastBusinessDay: boolean;

  specificDays: boolean;

  months: boolean[];

  monthlyDays: boolean[];

  monthlyBusinessCalendar: string;

  // Continuous Fields
  dailyRestart: boolean;

  // Dependent Fields
  runOnFailure: boolean;

  restartOnCondition: boolean;

  dependentOnQuerySerials: string[];

  useMinStartTime: boolean;

  runOnAny: boolean;

  deadlineStartTime: number;

  deadlineEndTime: number;

  runEveryTime: boolean;

  // Temporary Fields
  temporaryQueueName: string;

  expirationTimeMillis: number;

  temporaryDependentOnQuerySerials: string[];

  // Range Fields
  startDateTime: CalendarDateTime | null;

  stopDateTime: CalendarDateTime | null;

  static defaultCalendar?: string;

  /**
   * Creates a Default Scheduler.
   */
  static createDefault = (): QueryScheduler => new QueryScheduler();

  static makeDefaultScheduling(
    restartQueryWhenRunningDefault: string,
    timeZone: string
  ): [string, string] {
    return [
      QueryScheduler.TOKENS.RESTART_WHEN_RUNNING +
        QueryScheduler.TOKENS.DELIMITER +
        restartQueryWhenRunningDefault,
      QueryScheduler.FIELDS.TIME_ZONE +
        QueryScheduler.TOKENS.DELIMITER +
        timeZone,
    ];
  }

  static setDefaultCalendar(name: string): void {
    log.info('before', QueryScheduler.defaultCalendar, name);
    QueryScheduler.defaultCalendar = name;
    log.info('after', QueryScheduler.defaultCalendar, name);
  }

  static parseLocalTime = (string: string): number =>
    TimeUtils.parseTime(string);

  static localTimeToString = (timeInSeconds: number): string =>
    TimeUtils.formatTime(timeInSeconds);

  static MAX_LOCAL_TIME = 86399;

  static INVALID_SERIAL = '';

  // Helper method to turn arrays into delimted strings, e.g. 'Days=true=false=true'
  static arrayToDelimitedString = <T>(token: string, array: T[]): string => {
    const stringArray = [token];
    array.forEach(item =>
      stringArray.push(QueryScheduler.TOKENS.DELIMITER + item)
    );
    return stringArray.join('');
  };

  // The server side classes set SchedulerType to the qualified classname
  // if the class names or packages ever change, this will break
  static TYPES = Object.freeze({
    DAILY: 'com.illumon.iris.controller.IrisQuerySchedulerDaily',
    MONTHLY: 'com.illumon.iris.controller.IrisQuerySchedulerMonthly',
    CONTINUOUS: 'com.illumon.iris.controller.IrisQuerySchedulerContinuous',
    DEPENDENT: 'com.illumon.iris.controller.IrisQuerySchedulerDependent',
    TEMPORARY: 'com.illumon.iris.controller.IrisQuerySchedulerTemporary',
    RANGE: 'com.illumon.iris.controller.IrisQuerySchedulerRange',
  });

  // These are the tokens used to parse / create the String arrays
  static TOKENS = Object.freeze({
    // From IrisScheduler
    SCHEDULER_TYPE: 'SchedulerType',
    DELIMITER: '=',

    // From IrisQueryScheduler
    START_TIME: 'StartTime',
    STOP_TIME: 'StopTime',
    OVERNIGHT: 'Overnight',
    TIME_ZONE: 'TimeZone',
    DISABLED: 'SchedulingDisabled',
    REPEAT_ENABLED: 'RepeatEnabled',
    REPEAT_INTERVAL: 'RepeatInterval',
    SKIP_IF_UNSUCCESSFUL: 'SkipIfUnsuccessful',
    STOP_TIME_DISABLED: 'StopTimeDisabled',
    RESTART_ERROR_COUNT: 'RestartErrorCount',
    RESTART_ERROR_DELAY: 'RestartErrorDelay',
    RESTART_WHEN_RUNNING: 'RestartWhenRunning',

    // From IrisQuerySchedulerDaily
    BUSINESS_DAYS: 'BusinessDays',
    CALENDAR: 'Calendar',
    DAYS: 'Days',

    // From IrisQuerySchedulerMonthly
    FIRST_BUSINESS_DAY: 'FirstBusinessDay',
    LAST_BUSINESS_DAY: 'LastBusinessDay',
    SPECIFIC_DAYS: 'SpecificDays',
    MONTHS: 'Months',

    // From IrisQuerySchedulerContinuous
    DAILY_RESTART: 'DailyRestart',

    // From IrisQuerySchedulerDependent
    RUN_ON_FAILURE: 'RunOnFailure',
    RESTART_ON_CONDITION: 'RestartOnCondition',
    DEPENDENT_QUERY_SERIAL: 'DependentQuerySerial',
    USE_MIN_START_TIME: 'UseMinStartTime',
    RUN_ON_ANY: 'RunOnAny',
    DEADLINE_START: 'DeadlineStart',
    DEADLINE_END: 'DeadlineEnd',
    RUN_EACH_TIME: 'RunEachTime',

    // From IrisQuerySchedulerTemporary
    TEMPORARY_QUEUE_NAME: 'TemporaryQueueName',
    TEMPORARY_EXPIRATION_TIME_MILLIS: 'TemporaryExpirationTimeMillis',
    TEMPORARY_DEPENDENT_QUERY_SERIAL: 'TemporaryDependentQuerySerial',

    // From IrisQuerySchedulerRange
    USE_START_DATE_TIME: 'UseStartDateTime',
    USE_STOP_DATE_TIME: 'UseStopDateTime',
    START_DATE: 'StartDate',
    STOP_DATE: 'StopDate',

    // Other
    SERIAL_DELIMITER: ';',
  });

  static FIELDS = Object.freeze({
    TYPE: 'type',

    // From IrisQueryScheduler
    START_TIME: 'startTime',
    STOP_TIME: 'stopTime',
    TIME_ZONE: 'timeZone',
    SCHEDULING_DISABLED: 'schedulingDisabled',
    OVERNIGHT: 'overnight',
    REPEAT_ENABLED: 'repeatEnabled',
    STOP_TIME_DISABLED: 'stopTimeDisabled',
    REPEAT_INTERVAL: 'repeatInterval',
    SKIP_IF_UNSUCCESSFUL: 'skipIfUnsuccessful',
    RESTART_ERROR_COUNT: 'restartErrorCount',
    RESTART_DELAY_MINUTES: 'restartDelayMinutes',
    RESTART_WHEN_RUNNING: 'restartWhenRunning',

    // From IrisQuerySchedulerDaily
    BUSINESS_DAYS: 'businessDays',
    DAILY_BUSINESS_CALENDAR: 'dailyBusinessCalendar',
    DAILY_DAYS: 'dailyDays',

    // From IrisQuerySchedulerMonthly
    FIRST_BUSINESS_DAY: 'firstBusinessDay',
    LAST_BUSINESS_DAY: 'lastBusinessDay',
    SPECIFIC_DAYS: 'specificDays',
    MONTHS: 'months',
    MONTHLY_DAYS: 'monthlyDays',
    MONTHLY_BUSINESS_CALENDAR: 'monthlyBusinessCalendar',

    // From IrisQuerySchedulerContinuous
    DAILY_RESTART: 'dailyRestart',

    // From IrisQuerySchedulerDependent
    RUN_ON_FAILURE: 'runOnFailure',
    RESTART_ON_CONDITION: 'restartOnCondition',
    DEPENDENT_ON_QUERY_SERIALS: 'dependentOnQuerySerials',
    USE_MIN_START_TIME: 'useMinStartTime',
    RUN_ON_ANY: 'runOnAny',
    DEADLINE_START_TIME: 'deadlineStartTime',
    DEADLINE_END_TIME: 'deadlineEndTime',
    RUN_EVERY_TIME: 'runEveryTime',

    // From IrisQuerySchedulerTemporary
    TEMPORARY_QUEUE_NAME: 'temporaryQueueName',
    EXPIRATION_TIME_MILLIS: 'expirationTimeMillis',
    TEMPORARY_DEPENDENT_ON_QUERY_SERIALS: 'temporaryDependentOnQuerySerials',

    // From IrisQuerySchedulerRange
    START_DATE_TIME: 'startDateTime',
    STOP_DATE_TIME: 'stopDateTime',
  } as const);

  static DAYS_PER_WEEK = 7;

  static DAYS_PER_MONTH = 31;

  static MONTHS_PER_YEAR = 12;

  static MAX_ERROR_RESTART_COUNT = 10;

  static UNLIMITED_ERROR_RESTART_INDEX =
    QueryScheduler.MAX_ERROR_RESTART_COUNT + 1;

  // Per ISO-8601 the days array is Mon - Sun
  // This is display order which is Sun - Sat
  static DAYS = Object.freeze({
    SUN: { text: 'Su', value: 6 },
    MON: { text: 'Mo', value: 0 },
    TUE: { text: 'Tu', value: 1 },
    WED: { text: 'We', value: 2 },
    THU: { text: 'Th', value: 3 },
    FRI: { text: 'Fr', value: 4 },
    SAT: { text: 'Sa', value: 5 },
  });

  static MONTHS = Object.freeze({
    JAN: { text: 'Jan', value: 0 },
    FEB: { text: 'Feb', value: 1 },
    MAR: { text: 'Mar', value: 2 },
    APR: { text: 'Apr', value: 3 },
    MAY: { text: 'May', value: 4 },
    JUN: { text: 'Jun', value: 5 },
    JUL: { text: 'Jul', value: 6 },
    AUG: { text: 'Aug', value: 7 },
    SEP: { text: 'Sep', value: 8 },
    OCT: { text: 'Oct', value: 9 },
    NOV: { text: 'Nov', value: 10 },
    DEC: { text: 'Dec', value: 11 },
  });

  static RESTART_WHEN_RUNNING_OPTION = Object.freeze({
    YES: 'Yes',
    NO: 'No',
  });

  static validateSplitLength(
    s: unknown,
    splitString: string[],
    length: number
  ): void {
    if (splitString.length !== length) {
      throw new Error(`Unexpected error parsing scheduler string array: ${s}`);
    }
  }

  /**
   * Creats a new QueryScheduler object.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  constructor(stringArray?: readonly string[]) {
    // must define fields explicitly in constructor to ensure fields are properly
    // initialized even in derived classes
    this.type = QueryScheduler.TYPES.DAILY;

    // Base Fields
    this.startTimeInternal = QueryScheduler.parseLocalTime('07:55:00');
    this.stopTimeInternal = QueryScheduler.parseLocalTime('23:55:00');
    this.timeZone = DEFAULT_TIME_ZONE;
    this.schedulingDisabled = false;
    this.overnightInternal = false;
    this.repeatEnabled = false;
    this.stopTimeDisabledInternal = false;
    this.repeatInterval = 0;
    this.skipIfUnsuccessful = false;
    this.restartErrorCount = 0;
    this.restartDelayMinutes = 0;
    // TODO: use queryScheduler.restartWhenRunningDefault as the default, DH-11582
    this.restartWhenRunning = QueryScheduler.RESTART_WHEN_RUNNING_OPTION.NO;

    // Daily Fields
    this.businessDays = false;
    this.dailyBusinessCalendar = DEFAULT_CALENDAR;
    this.dailyDays = Array(QueryScheduler.DAYS_PER_WEEK).fill(true);

    // Monthly Fields
    this.firstBusinessDay = false;
    this.lastBusinessDay = false;
    this.specificDays = true;
    this.months = Array(QueryScheduler.MONTHS_PER_YEAR).fill(true);
    this.monthlyDays = Array(QueryScheduler.DAYS_PER_MONTH).fill(true);
    this.monthlyBusinessCalendar = DEFAULT_CALENDAR;

    // Continuous Fields
    this.dailyRestart = false;

    // Dependent Fields
    this.runOnFailure = false;
    this.restartOnCondition = false;
    this.dependentOnQuerySerials = [];
    this.useMinStartTime = false;
    this.runOnAny = false;
    this.deadlineStartTime = QueryScheduler.parseLocalTime('00:00:00');
    this.deadlineEndTime = QueryScheduler.parseLocalTime('23:59:59');
    this.runEveryTime = false;

    // Temporary Fields
    this.temporaryQueueName = '';
    this.expirationTimeMillis = DEFAULT_EXPIRATION_TIME_MILLIS;
    this.temporaryDependentOnQuerySerials = [];

    // Range Fields
    // Null means not set
    this.startDateTime = null;
    this.stopDateTime = null;

    if (stringArray != null) {
      this.parseFromStringArray(stringArray);
    }
  }

  /**
   * Automatically turns the overnight flag on / off based on start and stop time.
   */
  checkForOvernight(): void {
    const { overnightInternal, startTimeInternal, stopTimeInternal, type } =
      this;
    if (type === QueryScheduler.TYPES.RANGE || this.stopTimeDisabledInternal) {
      this.overnightInternal = false;
      return;
    }
    if (!overnightInternal && stopTimeInternal <= startTimeInternal) {
      this.overnightInternal = true;
    } else if (overnightInternal && startTimeInternal <= stopTimeInternal) {
      this.overnightInternal = false;
    }
  }

  get startTime(): number {
    return this.startTimeInternal;
  }

  set startTime(value: number) {
    this.startTimeInternal = value;
    this.checkForOvernight();
  }

  get stopTime(): number {
    return this.stopTimeInternal;
  }

  set stopTime(value: number) {
    this.stopTimeInternal = value;
    this.checkForOvernight();
  }

  get overnight(): boolean {
    return this.overnightInternal;
  }

  set overnight(value: boolean) {
    const { startTimeInternal, stopTimeInternal } = this;
    this.overnightInternal = value;
    if (
      (!value && stopTimeInternal < startTimeInternal) ||
      (value && startTimeInternal < stopTimeInternal)
    ) {
      this.startTimeInternal = stopTimeInternal;
      this.stopTimeInternal = startTimeInternal;
    }
  }

  get stopTimeDisabled(): boolean {
    return this.stopTimeDisabledInternal;
  }

  set stopTimeDisabled(value: boolean) {
    const { overnightInternal } = this;
    this.stopTimeDisabledInternal = value;
    if (value && overnightInternal) {
      this.overnight = false;
    }
  }

  /**
   * Creates a deep copy of this scheduler.
   *
   * @returns a copy of this scheduler
   */
  deepCopy(): QueryScheduler {
    const copy = Object.assign(new QueryScheduler(), this);
    copy.dailyDays = this.dailyDays.slice();
    copy.months = this.months.slice();
    copy.monthlyDays = this.monthlyDays.slice();
    copy.dependentOnQuerySerials = this.dependentOnQuerySerials.slice();
    copy.temporaryDependentOnQuerySerials =
      this.temporaryDependentOnQuerySerials.slice();
    copy.startDateTime =
      this.startDateTime == null ? null : this.startDateTime.copy();
    copy.stopDateTime =
      this.stopDateTime == null ? null : this.stopDateTime.copy();
    return copy;
  }

  /**
   * Ensures that the scheduler has meaningful defaults for all fields.  This allows
   * the UI to quickly switch between scheduler types.  Note that these defaults do
   * not create valid schedulers for all types.
   */
  initDefaults(): void {
    this.type = QueryScheduler.TYPES.DAILY;

    // Base Fields
    this.startTimeInternal = QueryScheduler.parseLocalTime('07:55:00');
    this.stopTimeInternal = QueryScheduler.parseLocalTime('23:55:00');
    this.timeZone = DEFAULT_TIME_ZONE;
    this.schedulingDisabled = false;
    this.overnightInternal = false;
    this.repeatEnabled = false;
    this.stopTimeDisabledInternal = false;
    this.repeatInterval = 0;
    this.skipIfUnsuccessful = false;
    this.restartErrorCount = 0;
    this.restartDelayMinutes = 0;
    // TODO: use queryScheduler.restartWhenRunningDefault as the default, DH-11582
    this.restartWhenRunning = QueryScheduler.RESTART_WHEN_RUNNING_OPTION.NO;

    // Daily Fields
    this.businessDays = false;
    this.dailyBusinessCalendar = DEFAULT_CALENDAR;
    this.dailyDays = Array(QueryScheduler.DAYS_PER_WEEK).fill(true);

    // Monthly Fields
    this.firstBusinessDay = false;
    this.lastBusinessDay = false;
    this.specificDays = true;
    this.months = Array(QueryScheduler.MONTHS_PER_YEAR).fill(true);
    this.monthlyDays = Array(QueryScheduler.DAYS_PER_MONTH).fill(true);
    this.monthlyBusinessCalendar = DEFAULT_CALENDAR;

    // Continuous Fields
    this.dailyRestart = false;

    // Dependent Fields
    this.runOnFailure = false;
    this.restartOnCondition = false;
    this.dependentOnQuerySerials = [];
    this.useMinStartTime = false;
    this.runOnAny = false;
    this.deadlineStartTime = QueryScheduler.parseLocalTime('00:00:00');
    this.deadlineEndTime = QueryScheduler.parseLocalTime('23:59:59');
    this.runEveryTime = false;

    // Temporary Fields
    this.temporaryQueueName = '';
    this.expirationTimeMillis = DEFAULT_EXPIRATION_TIME_MILLIS;
    this.temporaryDependentOnQuerySerials = [];

    // Range Fields
    // Null means not set
    this.startDateTime = null;
    this.stopDateTime = null;
  }

  /**
   * Parses an array of strings into a QueryScheduler object.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseFromStringArray(stringArray: readonly string[]): void {
    const typeSpecificStrings = this.parseBaseScheduler(stringArray);
    switch (this.type) {
      case QueryScheduler.TYPES.DAILY:
        this.parseDailyScheduler(typeSpecificStrings);
        break;
      case QueryScheduler.TYPES.MONTHLY:
        this.parseMonthlyScheduler(typeSpecificStrings);
        break;
      case QueryScheduler.TYPES.CONTINUOUS:
        this.parseContinuousScheduler(typeSpecificStrings);
        break;
      case QueryScheduler.TYPES.DEPENDENT:
        this.parseDependentScheduler(typeSpecificStrings);
        break;
      case QueryScheduler.TYPES.TEMPORARY:
        this.parseTemporaryScheduler(typeSpecificStrings);
        break;
      case QueryScheduler.TYPES.RANGE:
        this.parseRangeScheduler(typeSpecificStrings);
        break;
      default:
        throw new Error(`Unknown scheduler type: ${this.type}`);
    }
  }

  /**
   * Does the base parsing that is common to all scheduler types.
   *
   * @param stringArray an array of strings representing a scheduler
   * @returns an array of strings fo type specific parsers
   */
  parseBaseScheduler(stringArray: readonly string[]): string[] {
    const typeSpecificStrings: string[] = [];
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.SCHEDULER_TYPE:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.type = splitString[1];
          break;

        case QueryScheduler.TOKENS.START_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.startTimeInternal = QueryScheduler.parseLocalTime(
            splitString[1]
          );
          break;

        case QueryScheduler.TOKENS.STOP_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.stopTimeInternal = QueryScheduler.parseLocalTime(splitString[1]);
          break;

        case QueryScheduler.TOKENS.TIME_ZONE:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.timeZone = splitString[1];
          break;

        case QueryScheduler.TOKENS.DISABLED:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.schedulingDisabled = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.OVERNIGHT:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.overnightInternal = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.REPEAT_ENABLED:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.repeatEnabled = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.REPEAT_INTERVAL:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.repeatInterval = Number(splitString[1]);
          break;

        case QueryScheduler.TOKENS.SKIP_IF_UNSUCCESSFUL:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.skipIfUnsuccessful = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.STOP_TIME_DISABLED:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.stopTimeDisabledInternal = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.RESTART_ERROR_COUNT:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.restartErrorCount = Number(splitString[1]);

          break;

        case QueryScheduler.TOKENS.RESTART_ERROR_DELAY:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.restartDelayMinutes = Number(splitString[1]);
          break;

        case QueryScheduler.TOKENS.RESTART_WHEN_RUNNING:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.restartWhenRunning = splitString[1];
          break;

        default:
          // Save this string for a type specific parser
          typeSpecificStrings.push(s);
      }
    });

    // In legacy queries, stopTime can be null, as some queries may not have a stop time and it was not previously saved.
    // In that case stopTimeDisabled won't have been saved or set.
    if (this.stopTime == null) {
      this.stopTimeDisabledInternal = true;
    }

    return typeSpecificStrings;
  }

  /**
   * Parses the Daily scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseDailyScheduler(stringArray: string[]): void {
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.BUSINESS_DAYS:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.businessDays = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.CALENDAR:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.dailyBusinessCalendar = splitString[1];
          break;

        case QueryScheduler.TOKENS.DAYS:
          // Should split into the token plus seven days
          QueryScheduler.validateSplitLength(
            s,
            splitString,
            QueryScheduler.DAYS_PER_WEEK + 1
          );
          // Remove the token from the array and convert the strings to booleans
          this.dailyDays = splitString
            .filter(v => v !== QueryScheduler.TOKENS.DAYS)
            .map(b => b === 'true');
          break;

        default:
          log.warn('Found unexpected token while parsing daily schedule', s);
          break;
      }
    });
  }

  /**
   * Parses the Monthly scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseMonthlyScheduler(stringArray: string[]): void {
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.FIRST_BUSINESS_DAY:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.firstBusinessDay = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.LAST_BUSINESS_DAY:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.lastBusinessDay = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.CALENDAR:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.monthlyBusinessCalendar = splitString[1];
          break;

        case QueryScheduler.TOKENS.MONTHS:
          // Should split into the token plus 12 months
          QueryScheduler.validateSplitLength(
            s,
            splitString,
            QueryScheduler.MONTHS_PER_YEAR + 1
          );
          // Remove the token from the array and convert the strings to booleans
          this.months = splitString
            .filter(v => v !== QueryScheduler.TOKENS.MONTHS)
            .map(b => b === 'true');
          break;

        case QueryScheduler.TOKENS.SPECIFIC_DAYS:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.specificDays = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.DAYS:
          // Should split into the token plus 31 days
          QueryScheduler.validateSplitLength(
            s,
            splitString,
            QueryScheduler.DAYS_PER_MONTH + 1
          );
          // Remove the token from the array and convert the strings to booleans
          this.monthlyDays = splitString
            .filter(v => v !== QueryScheduler.TOKENS.DAYS)
            .map(b => b === 'true');
          break;

        default:
          log.warn('Found unexpected token while parsing monthly schedule', s);
          break;
      }
    });
  }

  /**
   * Parses the Continuous scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseContinuousScheduler(stringArray: string[]): void {
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.DAILY_RESTART:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.dailyRestart = splitString[1] === 'true';
          break;

        default:
          log.warn(
            'Found unexpected token while parsing continuous schedule',
            s
          );
          break;
      }
    });
  }

  /**
   * Parses the Dependent scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseDependentScheduler(stringArray: string[]): void {
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.RUN_ON_FAILURE:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.runOnFailure = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.RESTART_ON_CONDITION:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.restartOnCondition = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.DEPENDENT_QUERY_SERIAL:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.dependentOnQuerySerials = splitString[1].split(
            QueryScheduler.TOKENS.SERIAL_DELIMITER
          );
          break;

        case QueryScheduler.TOKENS.USE_MIN_START_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.useMinStartTime = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.RUN_ON_ANY:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.runOnAny = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.DEADLINE_START:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.deadlineStartTime = QueryScheduler.parseLocalTime(
            splitString[1]
          );
          break;

        case QueryScheduler.TOKENS.DEADLINE_END:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.deadlineEndTime = QueryScheduler.parseLocalTime(splitString[1]);
          break;

        case QueryScheduler.TOKENS.RUN_EACH_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.runEveryTime = splitString[1] === 'true';
          break;

        default:
          log.warn(
            'Found unexpected token while parsing dependent schedule',
            s
          );
          break;
      }
    });
  }

  /**
   * Parses the Temporary scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseTemporaryScheduler(stringArray: string[]): void {
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.TEMPORARY_QUEUE_NAME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.temporaryQueueName = splitString[1];
          break;

        case QueryScheduler.TOKENS.TEMPORARY_EXPIRATION_TIME_MILLIS:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // eslint-disable-next-line prefer-destructuring
          this.expirationTimeMillis = Number(splitString[1]);
          break;

        case QueryScheduler.TOKENS.TEMPORARY_DEPENDENT_QUERY_SERIAL:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          this.temporaryDependentOnQuerySerials = splitString[1].split(
            QueryScheduler.TOKENS.SERIAL_DELIMITER
          );
          break;

        default:
          log.warn('Found unexpected token while parsing tempory schedule', s);
          break;
      }
    });
  }

  /**
   * Parses the Range scheduler type.
   *
   * @param stringArray an array of strings representing a scheduler
   */
  parseRangeScheduler(stringArray: string[]): void {
    // The schedule includes boolean flags for whether to use the start and stop date times.
    // But the Web UI does not use them. Instead it sets dateTimes to null if they are not used.
    let useStartDateTime = false;
    let useStopDateTime = false;
    stringArray.forEach(s => {
      const splitString = s.split(QueryScheduler.TOKENS.DELIMITER);
      switch (splitString[0]) {
        case QueryScheduler.TOKENS.USE_START_DATE_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          useStartDateTime = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.USE_STOP_DATE_TIME:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          useStopDateTime = splitString[1] === 'true';
          break;

        case QueryScheduler.TOKENS.START_DATE:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // Combine the start date and start time
          // Format is 'yyyy-MM-ddTHH:mm:ss'
          // startTime will be set in base parser or this will use the default
          this.startDateTime = parseDateTime(
            `${splitString[1]}T${QueryScheduler.localTimeToString(
              this.startTime
            )}`
          );
          break;

        case QueryScheduler.TOKENS.STOP_DATE:
          QueryScheduler.validateSplitLength(s, splitString, 2);
          // Combine the stop date and stop time
          // Format is 'yyyy-MM-ddTHH:mm:ss'
          // stopTime will be set in base parser or this will use the default
          this.stopDateTime = parseDateTime(
            `${splitString[1]}T${QueryScheduler.localTimeToString(
              this.stopTime
            )}`
          );
          break;

        default:
          log.warn('Found unexpected token while parsing tempory schedule', s);
          break;
      }
    });
    if (!useStartDateTime) {
      this.startDateTime = null;
    }
    if (!useStopDateTime) {
      this.stopDateTime = null;
    }
  }

  /**
   * Generates an array of strings that describes the scheduler.
   *
   * @returns an array of strings describing the scheduler
   */
  toStringArray(): string[] {
    const arrayEntries: string[] = [];
    switch (this.type) {
      case QueryScheduler.TYPES.DAILY:
        this.toStringArrayDaily(arrayEntries);
        break;
      case QueryScheduler.TYPES.MONTHLY:
        this.toStringArrayMonthly(arrayEntries);
        break;
      case QueryScheduler.TYPES.CONTINUOUS:
        this.toStringArrayContinuous(arrayEntries);
        break;
      case QueryScheduler.TYPES.DEPENDENT:
        this.toStringArrayDependent(arrayEntries);
        break;
      case QueryScheduler.TYPES.TEMPORARY:
        this.toStringArrayTemporary(arrayEntries);
        break;
      case QueryScheduler.TYPES.RANGE:
        this.toStringArrayRange(arrayEntries);
        break;
      default:
        throw new Error(`Unknown scheduler type: ${this.type}`);
    }

    this.toStringArrayBase(arrayEntries);

    return arrayEntries;
  }

  /**
   * Generates an array of strings for the Base scheduler.
   */
  toStringArrayBase(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.START_TIME +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.localTimeToString(this.startTime)
    );
    if (this.stopTime != null) {
      arrayEntries.push(
        QueryScheduler.TOKENS.STOP_TIME +
          QueryScheduler.TOKENS.DELIMITER +
          QueryScheduler.localTimeToString(this.stopTime)
      );
    }
    arrayEntries.push(
      QueryScheduler.TOKENS.TIME_ZONE +
        QueryScheduler.TOKENS.DELIMITER +
        this.timeZone
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.DISABLED +
        QueryScheduler.TOKENS.DELIMITER +
        this.schedulingDisabled
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.OVERNIGHT +
        QueryScheduler.TOKENS.DELIMITER +
        this.overnight
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.REPEAT_ENABLED +
        QueryScheduler.TOKENS.DELIMITER +
        this.repeatEnabled
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.SKIP_IF_UNSUCCESSFUL +
        QueryScheduler.TOKENS.DELIMITER +
        this.skipIfUnsuccessful
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.STOP_TIME_DISABLED +
        QueryScheduler.TOKENS.DELIMITER +
        this.stopTimeDisabled
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RESTART_ERROR_COUNT +
        QueryScheduler.TOKENS.DELIMITER +
        this.restartErrorCount
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RESTART_ERROR_DELAY +
        QueryScheduler.TOKENS.DELIMITER +
        this.restartDelayMinutes
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RESTART_WHEN_RUNNING +
        QueryScheduler.TOKENS.DELIMITER +
        this.restartWhenRunning
    );

    if (this.repeatInterval > 0) {
      arrayEntries.push(
        QueryScheduler.TOKENS.REPEAT_INTERVAL +
          QueryScheduler.TOKENS.DELIMITER +
          this.repeatInterval
      );
    }
  }

  /**
   * Generates an array of strings for a Daily scheduler.
   */
  toStringArrayDaily(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.DAILY
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.CALENDAR +
        QueryScheduler.TOKENS.DELIMITER +
        this.dailyBusinessCalendar
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.BUSINESS_DAYS +
        QueryScheduler.TOKENS.DELIMITER +
        this.businessDays
    );

    arrayEntries.push(
      QueryScheduler.arrayToDelimitedString(
        QueryScheduler.TOKENS.DAYS,
        this.dailyDays
      )
    );
  }

  /**
   * Generates an array of strings for a Monthly scheduler.
   */
  toStringArrayMonthly(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.MONTHLY
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.CALENDAR +
        QueryScheduler.TOKENS.DELIMITER +
        this.monthlyBusinessCalendar
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.FIRST_BUSINESS_DAY +
        QueryScheduler.TOKENS.DELIMITER +
        this.firstBusinessDay
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.LAST_BUSINESS_DAY +
        QueryScheduler.TOKENS.DELIMITER +
        this.lastBusinessDay
    );

    arrayEntries.push(
      QueryScheduler.arrayToDelimitedString(
        QueryScheduler.TOKENS.MONTHS,
        this.months
      )
    );

    arrayEntries.push(
      QueryScheduler.TOKENS.SPECIFIC_DAYS +
        QueryScheduler.TOKENS.DELIMITER +
        this.specificDays
    );

    arrayEntries.push(
      QueryScheduler.arrayToDelimitedString(
        QueryScheduler.TOKENS.DAYS,
        this.monthlyDays
      )
    );
  }

  /**
   * Generates an array of strings for a Continuous scheduler.
   */
  toStringArrayContinuous(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.CONTINUOUS
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.DAILY_RESTART +
        QueryScheduler.TOKENS.DELIMITER +
        this.dailyRestart
    );
  }

  /**
   * Generates an array of strings for a Dependent scheduler.
   */
  toStringArrayDependent(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.DEPENDENT
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RUN_ON_FAILURE +
        QueryScheduler.TOKENS.DELIMITER +
        this.runOnFailure
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RESTART_ON_CONDITION +
        QueryScheduler.TOKENS.DELIMITER +
        this.restartOnCondition
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.DEPENDENT_QUERY_SERIAL +
        QueryScheduler.TOKENS.DELIMITER +
        this.dependentOnQuerySerials.join(
          QueryScheduler.TOKENS.SERIAL_DELIMITER
        )
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.USE_MIN_START_TIME +
        QueryScheduler.TOKENS.DELIMITER +
        this.useMinStartTime
    );

    arrayEntries.push(
      QueryScheduler.TOKENS.RUN_ON_ANY +
        QueryScheduler.TOKENS.DELIMITER +
        this.runOnAny
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.DEADLINE_START +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.localTimeToString(this.deadlineStartTime)
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.DEADLINE_END +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.localTimeToString(this.deadlineEndTime)
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.RUN_EACH_TIME +
        QueryScheduler.TOKENS.DELIMITER +
        this.runEveryTime
    );
  }

  /**
   * Generates an array of strings for a Temporary scheduler.
   */
  toStringArrayTemporary(arrayEntries: string[]): void {
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.TEMPORARY
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.TEMPORARY_QUEUE_NAME +
        QueryScheduler.TOKENS.DELIMITER +
        this.temporaryQueueName
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.TEMPORARY_EXPIRATION_TIME_MILLIS +
        QueryScheduler.TOKENS.DELIMITER +
        this.expirationTimeMillis
    );
    const { temporaryDependentOnQuerySerials } = this;
    if (
      temporaryDependentOnQuerySerials != null &&
      temporaryDependentOnQuerySerials.length > 0
    ) {
      arrayEntries.push(
        QueryScheduler.TOKENS.TEMPORARY_DEPENDENT_QUERY_SERIAL +
          QueryScheduler.TOKENS.DELIMITER +
          temporaryDependentOnQuerySerials.join(
            QueryScheduler.TOKENS.SERIAL_DELIMITER
          )
      );
    }
  }

  /**
   * Generates an array of strings for a Range scheduler.
   */
  toStringArrayRange(arrayEntries: string[]): void {
    const useStartDateTime = this.startDateTime != null;
    const useStopDateTime = this.stopDateTime != null;
    arrayEntries.push(
      QueryScheduler.TOKENS.SCHEDULER_TYPE +
        QueryScheduler.TOKENS.DELIMITER +
        QueryScheduler.TYPES.RANGE
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.USE_START_DATE_TIME +
        QueryScheduler.TOKENS.DELIMITER +
        useStartDateTime
    );
    arrayEntries.push(
      QueryScheduler.TOKENS.USE_STOP_DATE_TIME +
        QueryScheduler.TOKENS.DELIMITER +
        useStopDateTime
    );
    if (this.startDateTime != null) {
      // Extract the startTime from the starDateTime
      // This will be written later in toStringArrayBase
      this.startTime = QueryScheduler.parseLocalTime(
        toTime(this.startDateTime).set({ millisecond: 0 }).toString()
      );
      // Extract the startDate from the startDateTime
      const startDate = toCalendarDate(this.startDateTime).toString();
      arrayEntries.push(
        QueryScheduler.TOKENS.START_DATE +
          QueryScheduler.TOKENS.DELIMITER +
          startDate
      );
    }
    if (this.stopDateTime != null) {
      // Extract the stopTime from the stopDateTime
      // This will be written later in toStringArrayBase
      this.stopTime = QueryScheduler.parseLocalTime(
        toTime(this.stopDateTime).set({ millisecond: 0 }).toString()
      );
      // Extract the stopDate from the stopDateTime
      const stopDate = toCalendarDate(this.stopDateTime).toString();
      arrayEntries.push(
        QueryScheduler.TOKENS.STOP_DATE +
          QueryScheduler.TOKENS.DELIMITER +
          stopDate
      );
    }
  }
}

export default QueryScheduler;
