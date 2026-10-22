import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Res } from "@nestjs/common";
import {
  DeleteAccountRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  type DeleteAccountRequest,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
} from "@wageguard/api-contracts";
import type { Response } from "express";

import { CurrentUser, Public, type AuthenticatedUser } from "../../common/auth-context.js";
import { AuthRateLimited } from "../../common/rate-limit.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuthService } from "./auth.service.js";
import type { IssuedSession } from "./session.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @AuthRateLimited()
  @Post("register")
  async register(
    @Body(new ZodPipe(RegisterRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { me, session } = await this.auth.register(body);
    this.setSessionCookie(res, session);
    return me;
  }

  @Public()
  @AuthRateLimited()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { me, session } = await this.auth.login(body.email, body.password);
    this.setSessionCookie(res, session);
    return me;
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.id, user.sessionId);
    this.clearSessionCookie(res);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.auth.me(user.id);
  }

  @AuthRateLimited()
  @Delete("me")
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(DeleteAccountRequestSchema)) body: DeleteAccountRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.deleteAccount(user.id, body.password);
    this.clearSessionCookie(res);
  }

  private setSessionCookie(res: Response, session: IssuedSession): void {
    // Relative Max-Age, not an absolute Expires: the browser times the cookie from receipt, so a
    // wrong client clock cannot expire it early or keep it late. The database expiry
    // (session.expiresAt) remains the authoritative server-side limit.
    res.cookie(this.config.sessionCookieName, session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "strict",
      path: "/",
      maxAge: this.config.sessionTtlMs,
    });
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(this.config.sessionCookieName, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "strict",
      path: "/",
    });
  }
}
