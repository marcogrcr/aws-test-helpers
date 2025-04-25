/** A generic logger interface. */
export interface Logger {
  /** Logs data wih the `TRACE` level. */
  trace(...params: unknown[]): void;

  /** Logs data wih the `DEBUG` level. */
  debug(...params: unknown[]): void;

  /** Logs data wih the `INFO` level. */
  info(...params: unknown[]): void;

  /** Logs data wih the `WARN` level. */
  warn(...params: unknown[]): void;

  /** Logs data wih the `ERROR` level. */
  error(...params: unknown[]): void;

  /** Logs data wih the `CRITICAL` level. */
  critical(...params: unknown[]): void;
}
