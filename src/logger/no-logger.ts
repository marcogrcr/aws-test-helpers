/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Logger } from "./logger";

/** Implements a {@link Logger} that does nothing. */
export class NoLogger implements Logger {
  /** {@inheritdoc} */
  trace(...params: unknown[]): void {}

  /** {@inheritdoc} */
  debug(...params: unknown[]): void {}

  /** {@inheritdoc} */
  info(...params: unknown[]): void {}

  /** {@inheritdoc} */
  warn(...params: unknown[]): void {}

  /** {@inheritdoc} */
  error(...params: unknown[]): void {}

  /** {@inheritdoc} */
  critical(...params: unknown[]): void {}
}
