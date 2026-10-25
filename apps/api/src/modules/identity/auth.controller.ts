import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from "@nestjs/common";
import {
  ChangePasswordRequestSchema,
  DeleteAccountRequestSchema,
  EmailOnlyRequestSchema,
  IdSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  TwoFactorConfirmRequestSchema,
  TwoFactorEnableRequestSchema,
  TwoFactorLoginRequestSchema,
  TwoFactorSetupRequestSchema,
  VerifyEmailRequestSchema,
  type AcceptedResponse,
  type ChangePasswordRequest,
  type DeleteAccountRequest,
  type EmailOnlyRequest,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type RecoveryCodesResponse,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SessionListResponse,
  type TwoFactorConfirmRequest,
  type TwoFactorEnableRequest,
  type TwoFactorLoginRequest,
  type TwoFactorSetupRequest,
  type TwoFactorSetupResponse,
  type VerifyEmailRequest,
} from "@wageguard/api-contracts";
import type { Request, Response } from "express";

import {
  AllowsPendingTwoFactor,
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from "../../common/auth-context.js";
import { AuthRateLimited } from "../../common/rate-limit.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";
import { AuthService } from "./auth.service.js";
import type { IssuedSession } from "./session.service.js";
import { SessionService } from "./session.service.js";
import { TwoFactorService } from "./two-factor.service.js";

const accepted = (message: string): AcceptedResponse => ({ status: "ACCEPTED", message });
const CHECK_EMAIL = "If that address can be used, we've sent it an email. Check your inbox.";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @AuthRateLimited()
  @Post("register")
  @HttpCode(202)
  async register(@Body(new ZodPipe(RegisterRequestSchema)) body: RegisterRequest): Promise<AcceptedResponse> {
    await this.auth.register(body);
    return accepted("Check your inbox for a link to confirm your email address.");
  }

  @Public()
  @AuthRateLimited()
  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodPipe(VerifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { me, session } = await this.auth.verifyEmail(body.token, req.get("user-agent"));
    this.setSessionCookie(res, session);
    return me;
  }

  @Public()
  @AuthRateLimited()
  @Post("verify-email/resend")
  @HttpCode(202)
  async resendVerification(
    @Body(new ZodPipe(EmailOnlyRequestSchema)) body: EmailOnlyRequest,
  ): Promise<AcceptedResponse> {
    await this.auth.resendVerification(body.email);
    return accepted(CHECK_EMAIL);
  }

  @Public()
  @AuthRateLimited()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const outcome = await this.auth.login(body.email, body.password, req.get("user-agent"));
    this.setSessionCookie(res, outcome.session);
    return outcome.status === "SIGNED_IN"
      ? { status: "SIGNED_IN", me: outcome.me }
      : { status: outcome.status };
  }

  @AllowsPendingTwoFactor()
  @AuthRateLimited()
  @Post("login/two-factor")
  @HttpCode(200)
  async loginTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(TwoFactorLoginRequestSchema)) body: TwoFactorLoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { me, session } = await this.auth.completeTwoFactor(
      user.id,
      user.sessionId,
      body.code,
      req.get("user-agent"),
    );
    this.setSessionCookie(res, session);
    return me;
  }

  @Public()
  @AuthRateLimited()
  @Post("password-reset")
  @HttpCode(202)
  async requestPasswordReset(
    @Body(new ZodPipe(EmailOnlyRequestSchema)) body: EmailOnlyRequest,
  ): Promise<AcceptedResponse> {
    await this.auth.requestPasswordReset(body.email);
    return accepted(CHECK_EMAIL);
  }

  @Public()
  @AuthRateLimited()
  @Post("password-reset/confirm")
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodPipe(ResetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
    this.clearSessionCookie(res);
  }

  @AuthRateLimited()
  @Post("password")
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.auth.changePassword(user.id, user.sessionId, body.currentPassword, body.newPassword);
  }

  @AllowsPendingTwoFactor()
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

  @Get("sessions")
  async listSessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionListResponse> {
    return { items: await this.sessions.list(user.id, user.sessionId) };
  }

  /** Signs out every session except this one. */
  @Delete("sessions")
  @HttpCode(204)
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.revokeOtherSessions(user.id, user.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodPipe(IdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.revokeSession(user.id, id);
    if (id === user.sessionId) {
      this.clearSessionCookie(res);
    }
  }

  @AuthRateLimited()
  @Post("two-factor/setup")
  @HttpCode(200)
  setupTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(TwoFactorSetupRequestSchema)) body: TwoFactorSetupRequest,
  ): Promise<TwoFactorSetupResponse> {
    return this.twoFactor.setup(user.id, body.password);
  }

  @AuthRateLimited()
  @Post("two-factor/enable")
  @HttpCode(200)
  async enableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(TwoFactorEnableRequestSchema)) body: TwoFactorEnableRequest,
  ): Promise<RecoveryCodesResponse> {
    return { recoveryCodes: await this.auth.enableTwoFactor(user.id, user.sessionId, body.code) };
  }

  @AuthRateLimited()
  @Post("two-factor/disable")
  @HttpCode(204)
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(TwoFactorConfirmRequestSchema)) body: TwoFactorConfirmRequest,
  ): Promise<void> {
    return this.auth.disableTwoFactor(user.id, body.password, body.code);
  }

  @AuthRateLimited()
  @Post("two-factor/recovery-codes")
  @HttpCode(200)
  async regenerateRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodPipe(TwoFactorConfirmRequestSchema)) body: TwoFactorConfirmRequest,
  ): Promise<RecoveryCodesResponse> {
    return {
      recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(user.id, body.password, body.code),
    };
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
      maxAge: session.ttlMs,
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
