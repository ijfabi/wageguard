import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface AuthenticatedUser {
  readonly id: string;
  readonly sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const IS_PUBLIC = "wageguard:isPublic";

/** Marks a route as reachable without a session. Everything else requires authentication. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const ALLOWS_PENDING_TWO_FACTOR = "wageguard:allowsPendingTwoFactor";

/**
 * Lets a session that is still waiting for its two-factor code reach this route. Only the routes
 * that finish or abandon sign-in use it.
 */
export const AllowsPendingTwoFactor = (): MethodDecorator => SetMetadata(ALLOWS_PENDING_TWO_FACTOR, true);

/** The authenticated user. Only usable on routes behind the global AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      throw new Error("CurrentUser used on a route without authentication");
    }
    return request.user;
  },
);
