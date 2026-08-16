import { describe, expect, it } from 'vitest';
import { CostMath, CostService, StaticPricingProvider } from '../../src/service/CostService.js';
import { makeRow } from '../helpers.js';

const PRICE = { input: 1, cacheRead: 0.5, cacheWrite: 0.25, output: 2 }; // $ per 1K tokens

describe('CostMath', () => {
  it('computes cost per 1K tokens across buckets', () => {
    // 1000 input @1 + 2000 cacheRead @0.5 + 4000 output @2 = 1 + 1 + 8 = 10
    expect(CostMath.forTokens(1000, 2000, null, 4000, PRICE)).toBe(10);
    expect(CostMath.forTokens(null, null, null, null, PRICE)).toBeNull();
  });

  it('splits a row into a bucket breakdown', () => {
    const b = CostMath.breakdownForRow(
      makeRow({ id: 1, inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 500, outputTokens: 4000 }),
      PRICE,
    );
    expect(b).toEqual({ input: 1, cacheRead: 1, cacheWrite: 0.125, output: 8, total: 10.125 });
  });
});

describe('StaticPricingProvider', () => {
  it('matches exact provider+model routes only', () => {
    const provider = new StaticPricingProvider({ p1: { m1: PRICE } });
    expect(provider.get('p1', 'm1')).toEqual(PRICE);
    expect(provider.get('p1', 'other')).toBeUndefined();
    expect(provider.get('p2', 'm1')).toBeUndefined();
  });
});

describe('CostService', () => {
  const cost = new CostService({ pricing: new StaticPricingProvider({ p1: { m1: PRICE } }) });

  it('returns scalar cost for priced rows and undefined otherwise', () => {
    expect(cost.costForRow(makeRow({ id: 1, provider: 'p1', model: 'm1', inputTokens: 1000, outputTokens: 1000 }))).toBe(3);
    expect(cost.costForRow(makeRow({ id: 2, provider: 'p2', model: 'm1', inputTokens: 1000 }))).toBeUndefined();
  });

  it('aggregates overview by provider and by provider/model, counting only priced rows', () => {
    const rows = [
      makeRow({ id: 1, provider: 'p1', model: 'm1', inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }),
      makeRow({ id: 2, provider: 'p1', model: 'm1', inputTokens: 1000, cacheReadTokens: 1000, outputTokens: 0, totalTokens: 2000 }),
      makeRow({ id: 3, provider: 'p2', model: 'mX', inputTokens: 5000, totalTokens: 5000 }), // no pricing
    ];
    const overview = cost.overview(rows, { from: 0, to: 1 });
    expect(overview.estimated).toBe(true);
    // row1: 1 + 2 = 3; row2: 1 + 0.5 = 1.5 → total 4.5
    expect(overview.total).toBeCloseTo(4.5);
    expect(overview.byProvider['p1']!.total).toBeCloseTo(4.5);
    expect(overview.byProvider['p2']).toBeUndefined();
    expect(overview.byModel['p1/m1']!.total).toBeCloseTo(4.5);
  });
});
