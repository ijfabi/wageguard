import type { IncomingMessage, ServerResponse } from "node:http";

import type { Params } from "nestjs-pino";

import { correlationId } from "../common/correlation.js";
import type { AppConfig } from "../config/config.js";

/**
 * Structured JSON logs (pino). Request bodies are never logged, so payslip contents, passwords
 * and shift data cannot reach the logs; credential-bearing headers are redacted as well. URLs are
 * logged without their query string.
 */
export function loggerOptions(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: correlationId,
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
        censor: "[REDACTED]",
      },
      serializers: {
        req: (req: IncomingMessage & { id?: unknown }) => ({
          id: req.id,
          method: req.method,
          path: (req.url ?? "").split("?")[0],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) =>
        error !== undefined || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    },
  };
}
