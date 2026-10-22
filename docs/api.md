# REST API

**Status: not implemented (Phase 2).** This page records the planned contract so that later work stays consistent with it.

All routes are under `/api/v1`. The OpenAPI document will be generated from the NestJS controllers and served at `/api/v1/docs`.

| Method    | Path                                                                | Notes                                           |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| POST, GET | `/employments`, `/employments/:id`                                  | Owner-scoped                                    |
| POST      | `/shifts`, `/shifts/import`                                         | Import accepts CSV with size and row caps       |
| GET       | `/shifts`                                                           | Paginated                                       |
| PATCH     | `/shifts/:id`                                                       | Optimistic concurrency via `If-Match` / version |
| POST, GET | `/payslips`, `/payslips/:id`                                        |                                                 |
| POST      | `/audits`                                                           | Requires an `Idempotency-Key` header            |
| GET       | `/audits`, `/audits/:id`, `/audits/:id/lines`, `/audits/:id/report` |                                                 |
| GET       | `/rules/versions`                                                   | Backed by `AwardRuleRegistry.list()`            |
| GET       | `/health`, `/ready`                                                 | Liveness and readiness                          |

## Error format

Errors will use a consistent body:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "...",
    "issues": [{ "code": "INVALID_LOCAL_DATE", "path": "shifts[0].start", "message": "..." }],
    "correlationId": "..."
  }
}
```

Domain issue codes are the ones defined in `packages/domain/src/errors.ts` and `packages/calculation-engine/src/issues.ts`.
