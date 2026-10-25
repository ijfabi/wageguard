import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
  PublicHolidaysQuerySchema,
  type PublicHolidaysQuery,
  type PublicHolidaysResponse,
} from "@wageguard/api-contracts";
import {
  PUBLIC_HOLIDAY_YEARS,
  publicHolidaysBetween,
  type AwardRuleRegistry,
  type RuleSetSummary,
} from "@wageguard/award-rules";

import { ApiError } from "../../common/api-error.js";
import { Public } from "../../common/auth-context.js";
import { ZodPipe } from "../../common/zod.pipe.js";
import { RULE_SET_RESOLVER } from "../audits/audits.service.js";

const MAX_RANGE_DAYS = 400;

/** Published rule-set versions and public holidays. Public: reference data only, no user data. */
@Controller()
export class RulesController {
  constructor(@Inject(RULE_SET_RESOLVER) private readonly registry: AwardRuleRegistry) {}

  @Public()
  @Get("rules/versions")
  versions(): { items: RuleSetSummary[] } {
    return { items: this.registry.list() };
  }

  /** State and territory public holidays from the bundled Fair Work Ombudsman lists. */
  @Public()
  @Get("public-holidays")
  publicHolidays(
    @Query(new ZodPipe(PublicHolidaysQuerySchema)) query: PublicHolidaysQuery,
  ): PublicHolidaysResponse {
    const days = (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000;
    if (!(days >= 0 && days <= MAX_RANGE_DAYS)) {
      throw ApiError.validation([
        {
          code: "INVALID_RANGE",
          message: `'to' must be on or after 'from', within ${MAX_RANGE_DAYS} days`,
          path: "to",
        },
      ]);
    }
    return {
      holidays: publicHolidaysBetween(query.state, query.from, query.to),
      coveredYears: [...PUBLIC_HOLIDAY_YEARS],
      source: "Fair Work Ombudsman public holiday lists, retrieved 25 October 2026",
    };
  }
}
