import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiErrorCode } from "@wageguard/api-contracts";

import { ApiError } from "../../common/api-error.js";
import {
  ALLOWS_PENDING_TWO_FACTOR,
  IS_PUBLIC,
  type AuthenticatedRequest,
} from "../../common/auth-context.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { SessionService } from "./session.service.js";

/** Global guard: every route requires a valid session unless explicitly marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[this.config.sessionCookieName];
    const session = typeof token === "string" ? await this.sessions.resolve(token) : null;
    if (session === null) {
      throw new ApiError(401, ApiErrorCode.UNAUTHENTICATED, "Sign in to continue");
    }
    if (
      !session.verified &&
      this.reflector.get<boolean | undefined>(ALLOWS_PENDING_TWO_FACTOR, context.getHandler()) !== true
    ) {
      throw new ApiError(
        401,
        ApiErrorCode.TWO_FACTOR_REQUIRED,
        "Enter the code from your authenticator app to finish signing in",
      );
    }
    request.user = { id: session.userId, sessionId: session.sessionId };
    return true;
  }
}
