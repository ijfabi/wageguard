import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { Public } from "../common/auth-context.js";
import { buildOpenApiDocument } from "./openapi.js";

export const API_VERSION = "0.1.0";

@Public()
@SkipThrottle()
@Controller()
export class OpenApiController {
  private readonly document = buildOpenApiDocument(API_VERSION);

  @Get("openapi.json")
  get(): object {
    return this.document;
  }
}
