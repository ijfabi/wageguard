import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { LIMITS } from "@wageguard/api-contracts";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { AppModule, type AppOverrides } from "./app.module.js";
import type { AppConfig } from "./config/config.js";

export const API_PREFIX = "api/v1";

/** Builds a fully configured (not yet listening) application. Used by main.ts and the tests. */
export async function createApp(
  config: AppConfig,
  overrides: AppOverrides = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, overrides), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  app.set("trust proxy", false);
  app.disable("x-powered-by");
  app.use(
    helmet({
      // JSON API: no scripts, frames or embedded content are ever served.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      strictTransportSecurity: config.cookieSecure,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser("json", { limit: LIMITS.maxJsonBodyBytes });
  app.useBodyParser("text", { type: "text/csv", limit: LIMITS.maxCsvBytes });
  app.enableCors({ origin: [...config.allowedOrigins], credentials: true });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
