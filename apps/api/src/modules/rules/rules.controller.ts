import { Controller, Get, Inject } from "@nestjs/common";
import type { AwardRuleRegistry, RuleSetSummary } from "@wageguard/award-rules";

import { Public } from "../../common/auth-context.js";
import { RULE_SET_RESOLVER } from "../audits/audits.service.js";

/** Published rule-set versions. Public: contains award metadata only, no user data. */
@Controller("rules")
export class RulesController {
  constructor(@Inject(RULE_SET_RESOLVER) private readonly registry: AwardRuleRegistry) {}

  @Public()
  @Get("versions")
  versions(): { items: RuleSetSummary[] } {
    return { items: this.registry.list() };
  }
}
