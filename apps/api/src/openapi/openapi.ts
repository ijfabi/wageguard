import {
  AuditDetailSchema,
  AuditLinesSchema,
  AuditReportSchema,
  AuditSummarySchema,
  CreateAuditRequestSchema,
  CreateEmploymentRequestSchema,
  CreatePayslipRequestSchema,
  CreateShiftRequestSchema,
  DashboardResponseSchema,
  DeleteAccountRequestSchema,
  EmploymentResponseSchema,
  ErrorBodySchema,
  IdempotencyKeySchema,
  ImportShiftsQuerySchema,
  ImportShiftsResponseSchema,
  ListAuditsQuerySchema,
  ListPayslipsQuerySchema,
  ListShiftsQuerySchema,
  LoginRequestSchema,
  MeResponseSchema,
  PageQuerySchema,
  PayslipResponseSchema,
  RegisterRequestSchema,
  ShiftResponseSchema,
  UpdateShiftRequestSchema,
  pageOf,
} from "@wageguard/api-contracts";
import { z } from "zod";

type Method = "get" | "post" | "patch" | "delete";

export interface RouteSpec {
  readonly method: Method;
  /** Express-style path under /api/v1, e.g. /audits/:id */
  readonly path: string;
  readonly summary: string;
  readonly tag: string;
  readonly auth: boolean;
  readonly body?: z.ZodType;
  readonly bodyContentType?: "application/json" | "text/csv";
  readonly query?: z.ZodObject;
  readonly headers?: Readonly<Record<string, z.ZodType>>;
  readonly responses: Readonly<
    Record<number, { description: string; schema?: z.ZodType; binary?: "application/pdf" }>
  >;
}

const ok = (schema: z.ZodType, description = "OK") => ({ description, schema });
const empty = { description: "No content" };

const RuleSetSummarySchema = z.object({
  version: z.string(),
  awardCode: z.string(),
  awardTitle: z.string(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().nullable(),
  effectiveBasis: z.string(),
  fingerprint: z.string(),
  sourceUrl: z.string(),
  enabledRuleCount: z.number().int(),
  disabledRuleCount: z.number().int(),
});

/**
 * Every route the API exposes. A test asserts this list matches the routes Nest actually
 * registers, so the OpenAPI document cannot silently drift from the implementation.
 */
export const ROUTES: readonly RouteSpec[] = [
  {
    method: "post",
    path: "/auth/register",
    summary: "Create an account and start a session",
    tag: "auth",
    auth: false,
    body: RegisterRequestSchema,
    responses: {
      201: ok(MeResponseSchema, "Created; session cookie set"),
      409: { description: "Email already registered" },
    },
  },
  {
    method: "post",
    path: "/auth/login",
    summary: "Start a session",
    tag: "auth",
    auth: false,
    body: LoginRequestSchema,
    responses: {
      200: ok(MeResponseSchema, "Session cookie set"),
      401: { description: "Invalid credentials" },
    },
  },
  {
    method: "post",
    path: "/auth/logout",
    summary: "End the current session",
    tag: "auth",
    auth: true,
    responses: { 204: empty },
  },
  {
    method: "get",
    path: "/auth/me",
    summary: "Current user",
    tag: "auth",
    auth: true,
    responses: { 200: ok(MeResponseSchema) },
  },
  {
    method: "delete",
    path: "/auth/me",
    summary: "Delete the account and all of its data",
    tag: "auth",
    auth: true,
    body: DeleteAccountRequestSchema,
    responses: { 204: empty },
  },
  {
    method: "post",
    path: "/employments",
    summary: "Create an employment profile",
    tag: "employments",
    auth: true,
    body: CreateEmploymentRequestSchema,
    responses: { 201: ok(EmploymentResponseSchema) },
  },
  {
    method: "get",
    path: "/employments",
    summary: "List employment profiles",
    tag: "employments",
    auth: true,
    query: PageQuerySchema,
    responses: { 200: ok(pageOf(EmploymentResponseSchema)) },
  },
  {
    method: "get",
    path: "/employments/:id",
    summary: "Get an employment profile",
    tag: "employments",
    auth: true,
    responses: { 200: ok(EmploymentResponseSchema) },
  },
  {
    method: "post",
    path: "/shifts",
    summary: "Record a shift",
    tag: "shifts",
    auth: true,
    body: CreateShiftRequestSchema,
    responses: { 201: ok(ShiftResponseSchema), 409: { description: "Overlaps another shift" } },
  },
  {
    method: "post",
    path: "/shifts/import",
    summary: "Import shifts from CSV (all or nothing)",
    tag: "shifts",
    auth: true,
    body: z.string(),
    bodyContentType: "text/csv",
    query: ImportShiftsQuerySchema,
    responses: { 201: ok(ImportShiftsResponseSchema) },
  },
  {
    method: "get",
    path: "/shifts",
    summary: "List shifts",
    tag: "shifts",
    auth: true,
    query: ListShiftsQuerySchema,
    responses: { 200: ok(pageOf(ShiftResponseSchema)) },
  },
  {
    method: "get",
    path: "/shifts/:id",
    summary: "Get a shift",
    tag: "shifts",
    auth: true,
    responses: { 200: ok(ShiftResponseSchema) },
  },
  {
    method: "patch",
    path: "/shifts/:id",
    summary: "Replace a shift's times (optimistic concurrency)",
    tag: "shifts",
    auth: true,
    body: UpdateShiftRequestSchema,
    responses: { 200: ok(ShiftResponseSchema), 409: { description: "Version conflict or overlap" } },
  },
  {
    method: "post",
    path: "/payslips",
    summary: "Enter a payslip",
    tag: "payslips",
    auth: true,
    body: CreatePayslipRequestSchema,
    responses: { 201: ok(PayslipResponseSchema) },
  },
  {
    method: "get",
    path: "/payslips/:id",
    summary: "Get a payslip",
    tag: "payslips",
    auth: true,
    responses: { 200: ok(PayslipResponseSchema) },
  },
  {
    method: "get",
    path: "/payslips",
    summary: "List payslips (newest first)",
    tag: "payslips",
    auth: true,
    query: ListPayslipsQuerySchema,
    responses: { 200: ok(pageOf(PayslipResponseSchema)) },
  },
  {
    method: "get",
    path: "/dashboard",
    summary: "Audit totals, recent audits and monthly history for the signed-in user",
    tag: "dashboard",
    auth: true,
    responses: { 200: ok(DashboardResponseSchema) },
  },
  {
    method: "post",
    path: "/audits",
    summary: "Run an audit (idempotent)",
    tag: "audits",
    auth: true,
    body: CreateAuditRequestSchema,
    headers: { "Idempotency-Key": IdempotencyKeySchema },
    responses: {
      201: ok(AuditDetailSchema, "Audit created"),
      200: ok(AuditDetailSchema, "Replay of an earlier request with the same key"),
      422: { description: "Validation failed or key reused for a different request" },
    },
  },
  {
    method: "get",
    path: "/audits",
    summary: "List audits",
    tag: "audits",
    auth: true,
    query: ListAuditsQuerySchema,
    responses: { 200: ok(pageOf(AuditSummarySchema)) },
  },
  {
    method: "get",
    path: "/audits/:id",
    summary: "Audit detail with findings",
    tag: "audits",
    auth: true,
    responses: { 200: ok(AuditDetailSchema) },
  },
  {
    method: "get",
    path: "/audits/:id/lines",
    summary: "Pay lines and shift-by-shift breakdown",
    tag: "audits",
    auth: true,
    responses: { 200: ok(AuditLinesSchema) },
  },
  {
    method: "get",
    path: "/audits/:id/report",
    summary: "Downloadable evidence report (JSON)",
    tag: "audits",
    auth: true,
    responses: { 200: ok(AuditReportSchema) },
  },
  {
    method: "get",
    path: "/audits/:id/report/pdf",
    summary: "Downloadable evidence report (PDF, built from the same snapshot as the JSON report)",
    tag: "audits",
    auth: true,
    responses: { 200: { description: "A4 PDF attachment", binary: "application/pdf" } },
  },
  {
    method: "get",
    path: "/rules/versions",
    summary: "Published award rule-set versions",
    tag: "rules",
    auth: false,
    responses: { 200: ok(z.object({ items: z.array(RuleSetSummarySchema) })) },
  },
  {
    method: "get",
    path: "/health",
    summary: "Liveness",
    tag: "operations",
    auth: false,
    responses: { 200: ok(z.object({ status: z.literal("ok") })) },
  },
  {
    method: "get",
    path: "/ready",
    summary: "Readiness (database reachable)",
    tag: "operations",
    auth: false,
    responses: { 200: ok(z.object({ status: z.literal("ready") })), 503: { description: "Not ready" } },
  },
  {
    method: "get",
    path: "/openapi.json",
    summary: "This document",
    tag: "operations",
    auth: false,
    responses: { 200: { description: "OpenAPI 3.1 document" } },
  },
];

const jsonSchema = (schema: z.ZodType, io: "input" | "output"): object =>
  z.toJSONSchema(schema, { io, unrepresentable: "any", target: "draft-2020-12" });

const COMMON_ERRORS = {
  400: "Malformed request",
  401: "Not signed in",
  403: "Cross-origin request rejected",
  404: "Not found (also returned for resources owned by another user)",
  413: "Body too large",
  422: "Validation failed",
  429: "Rate limited",
  503: "Temporarily unavailable (database unreachable); retry after the Retry-After delay",
} as const;

export function buildOpenApiDocument(version: string): object {
  const paths: Record<string, Record<string, object>> = {};
  for (const route of ROUTES) {
    const openApiPath = `/api/v1${route.path.replace(/:(\w+)/g, "{$1}")}`;
    const parameters = [
      ...[...route.path.matchAll(/:(\w+)/g)].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      })),
      ...(route.query === undefined
        ? []
        : Object.entries(route.query.shape).map(([name, schema]) => ({
            name,
            in: "query",
            required: !(schema as z.ZodType).safeParse(undefined).success,
            schema: jsonSchema(schema as z.ZodType, "input"),
          }))),
      ...Object.entries(route.headers ?? {}).map(([name, schema]) => ({
        name,
        in: "header",
        required: true,
        schema: jsonSchema(schema, "input"),
      })),
    ];
    const responses: Record<string, object> = {};
    for (const [status, response] of Object.entries(route.responses)) {
      responses[status] =
        response.binary !== undefined
          ? {
              description: response.description,
              content: { [response.binary]: { schema: { type: "string", format: "binary" } } },
            }
          : response.schema === undefined
            ? { description: response.description }
            : {
                description: response.description,
                content: { "application/json": { schema: jsonSchema(response.schema, "output") } },
              };
    }
    for (const [status, description] of Object.entries(COMMON_ERRORS)) {
      if (responses[status] === undefined && (route.auth || status !== "401")) {
        responses[status] = {
          description,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        };
      }
    }
    paths[openApiPath] ??= {};
    paths[openApiPath][route.method] = {
      summary: route.summary,
      tags: [route.tag],
      ...(route.auth ? {} : { security: [] }),
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(route.body === undefined
        ? {}
        : {
            requestBody: {
              required: true,
              content: {
                [route.bodyContentType ?? "application/json"]: { schema: jsonSchema(route.body, "input") },
              },
            },
          }),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "WageGuard API",
      version,
      description: "Australian payroll verification. Informational only; not legal advice.",
    },
    servers: [{ url: "/" }],
    security: [{ sessionCookie: [] }],
    components: {
      securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "wg_session" } },
      schemas: { Error: jsonSchema(ErrorBodySchema, "output") },
    },
    paths,
  };
}
