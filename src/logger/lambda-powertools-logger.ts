import { Logger as PowertoolsLogger } from "@aws-lambda-powertools/logger";
import type {
  LogItemExtraInput,
  LogItemMessage,
} from "@aws-lambda-powertools/logger/types";

import type { Logger } from "./logger";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "critical";

/** Implements {@link Logger} with {@link PowertoolsLogger}. */
export class LambdaPowertoolsLogger implements Logger {
  readonly #logger: PowertoolsLogger;

  constructor(logger: PowertoolsLogger) {
    this.#logger = logger;
  }

  /** {@inheritdoc} */
  trace(...params: unknown[]): void {
    this.#log("trace", params);
  }

  /** {@inheritdoc} */
  debug(...params: unknown[]): void {
    this.#log("debug", params);
  }

  /** {@inheritdoc} */
  info(...params: unknown[]): void {
    this.#log("info", params);
  }

  /** {@inheritdoc} */
  warn(...params: unknown[]): void {
    this.#log("warn", params);
  }

  /** {@inheritdoc} */
  error(...params: unknown[]): void {
    this.#log("error", params);
  }

  /** {@inheritdoc} */
  critical(...params: unknown[]): void {
    this.#log("critical", params);
  }

  #log(level: LogLevel, params: unknown[]): void {
    const [msg, ...rest] = params;

    let transformedMsg: LogItemMessage;
    switch (true) {
      case typeof msg === "string": {
        transformedMsg = msg;
        break;
      }

      case msg !== null && typeof msg === "object": {
        transformedMsg = msg as LogItemMessage;
        break;
      }

      default: {
        transformedMsg = msg?.toString() ?? "";
        break;
      }
    }

    let transformedRest: LogItemExtraInput;
    switch (true) {
      case rest.length === 1 &&
        (typeof rest[0] === "string" || rest[0] instanceof Error): {
        transformedRest = [rest[0]];
        break;
      }

      default: {
        transformedRest = rest.map((param, i) =>
          param !== null &&
          typeof param === "object" &&
          !(param instanceof Error)
            ? param
            : { [`param${i}`]: param },
        ) as LogItemExtraInput;
        break;
      }
    }

    this.#logger[level](transformedMsg, ...transformedRest);
  }
}
