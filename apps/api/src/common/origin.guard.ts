import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ApiErrorCode } from "@wageguard/api-contracts";
import type { Request } from "express";

import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ApiError } from "./api-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth. The primary control is the SameSite=Strict session cookie. In addition,
 * state-changing browser requests must come from an allowed origin: a request that declares a
 * cross-site context (Sec-Fetch-Site) or an Origin outside the allow-list is rejected. Non-browser
 * clients that send neither header are unaffected; they carry no ambient browser cookies.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowed = new Set(config.allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const origin = request.get("origin");
    if (
      request.get("sec-fetch-site") === "cross-site" ||
      (origin !== undefined && !this.allowed.has(origin))
    ) {
      throw new ApiError(
        403,
        ApiErrorCode.FORBIDDEN_ORIGIN,
        "Cross-origin state-changing requests are not allowed",
      );
    }
    return true;
  }
}
