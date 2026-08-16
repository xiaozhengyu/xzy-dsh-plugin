import type { CostBreakdown, CostOverview, TimeRange } from '../query/types.js';
import type { UsageRecordRow } from '../storage/UsageRepository.js';

/**
 * Per-1K-token price for one provider+model route. All values are USD-per-1K
 * tokens; costs computed from these are ALWAYS estimates (architecture doc
 * §3.8: actual bills depend on provider rules, promotions, region, plans).
 */
export interface Pricing {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

/** Resolves pricing for a provider+model route. */
export interface PricingProvider {
  get(provider: string, model: string): Pricing | undefined;
}

/** In-memory pricing table keyed by provider then model. */
export class StaticPricingProvider implements PricingProvider {
  constructor(private readonly prices: Readonly<Record<string, Readonly<Record<string, Pricing>>>>) {}

  get(provider: string, model: string): Pricing | undefined {
    return this.prices[provider]?.[model];
  }
}

/** Cost math (architecture doc §3.8). */
export const CostMath = {
  /** $ cost of one usage row under a price; null when tokens are absent. */
  forTokens(input: number | null, cacheRead: number | null, cacheWrite: number | null, output: number | null, price: Pricing): number | null {
    if (input === null && cacheRead === null && cacheWrite === null && output === null) return null;
    return (
      (input ?? 0) / 1000 * price.input +
      (cacheRead ?? 0) / 1000 * price.cacheRead +
      (cacheWrite ?? 0) / 1000 * price.cacheWrite +
      (output ?? 0) / 1000 * price.output
    );
  },

  breakdownForRow(row: UsageRecordRow, price: Pricing): CostBreakdown {
    const input = ((row.inputTokens ?? 0) / 1000) * price.input;
    const cacheRead = ((row.cacheReadTokens ?? 0) / 1000) * price.cacheRead;
    const cacheWrite = ((row.cacheWriteTokens ?? 0) / 1000) * price.cacheWrite;
    const output = ((row.outputTokens ?? 0) / 1000) * price.output;
    return { input, cacheRead, cacheWrite, output, total: input + cacheRead + cacheWrite + output };
  },
};

export interface CostServiceOptions {
  pricing: PricingProvider;
}

/**
 * Estimated-cost service over the ledger. `costForRow` returns the scalar $ for
 * one record (undefined when the route has no pricing); `breakdownForRow` gives
 * the per-bucket split. Aggregate cost views (overview by provider/model) are
 * built in UsageService.
 */
export class CostService {
  private readonly pricing: PricingProvider;

  constructor(options: CostServiceOptions) {
    this.pricing = options.pricing;
  }

  getPricing(provider: string, model: string): Pricing | undefined {
    return this.pricing.get(provider, model);
  }

  /** Scalar estimated cost of one row; undefined when the route lacks pricing. */
  costForRow(row: UsageRecordRow): number | undefined {
    const price = this.pricing.get(row.provider ?? '', row.model ?? '');
    if (!price) return undefined;
    const cost = CostMath.forTokens(
      row.inputTokens,
      row.cacheReadTokens,
      row.cacheWriteTokens,
      row.outputTokens,
      price,
    );
    return cost ?? undefined;
  }

  breakdownForRow(row: UsageRecordRow): CostBreakdown | undefined {
    const price = this.pricing.get(row.provider ?? '', row.model ?? '');
    if (!price) return undefined;
    return CostMath.breakdownForRow(row, price);
  }

  /** Aggregate cost over rows, split by provider and by provider/model. */
  overview(rows: readonly UsageRecordRow[], range: TimeRange): CostOverview {
    const byProvider: Record<string, CostBreakdown> = {};
    const byModel: Record<string, CostBreakdown> = {};
    let total = 0;
    for (const row of rows) {
      const breakdown = this.breakdownForRow(row);
      if (!breakdown) continue;
      total += breakdown.total;
      const providerKey = row.provider ?? '(unknown)';
      const modelKey = `${providerKey}/${row.model ?? '(unknown)'}`;
      byProvider[providerKey] = addBreakdown(byProvider[providerKey], breakdown);
      byModel[modelKey] = addBreakdown(byModel[modelKey], breakdown);
    }
    return { range, total, byProvider, byModel, estimated: true };
  }
}

function addBreakdown(current: CostBreakdown | undefined, next: CostBreakdown): CostBreakdown {
  if (!current) return { ...next };
  return {
    input: current.input + next.input,
    cacheRead: current.cacheRead + next.cacheRead,
    cacheWrite: current.cacheWrite + next.cacheWrite,
    output: current.output + next.output,
    total: current.total + next.total,
  };
}
