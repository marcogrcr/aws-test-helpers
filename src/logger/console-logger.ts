import type { Logger } from "./logger";

/** Implements {@link Logger} with the console. */
export class ConsoleLogger implements Logger {
  readonly #console: Console;

  constructor(consoleInstance: Console = console) {
    this.#console = consoleInstance;
  }

  /** {@inheritdoc} */
  trace(...params: unknown[]): void {
    this.#console.trace(...params);
  }

  /** {@inheritdoc} */
  debug(...params: unknown[]): void {
    this.#console.debug(...params);
  }

  /** {@inheritdoc} */
  info(...params: unknown[]): void {
    this.#console.info(...params);
  }

  /** {@inheritdoc} */
  warn(...params: unknown[]): void {
    this.#console.warn(...params);
  }

  /** {@inheritdoc} */
  error(...params: unknown[]): void {
    this.#console.error(...params);
  }

  /** {@inheritdoc} */
  critical(...params: unknown[]): void {
    this.#console.error(...params);
  }
}
