import assert from "node:assert/strict";
import type { SqlRunner } from "../property-search/db.ts";
import { formatMarketReport, getMarketReport } from "./market.ts";

class FakeDb implements SqlRunner {
  calls: { sql: string; params: (string | number)[] }[] = [];
  private readonly sold: unknown[];
  private readonly active: number;
  constructor(sold: unknown[], active: number) {
    this.sold = sold;
    this.active = active;
  }
  async query<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    return (sql.includes("FROM california_sold") ? this.sold : [{ total: this.active }]) as T[];
  }
}

const db = new FakeDb([
  { month: "2025-09", closeDate: "2025-09-15", closePrice: 800000, listPrice: 850000, livingArea: 1000, daysOnMarket: 15, zip: "92101", type: "Condominium" },
  { month: "2026-08", closeDate: "2026-08-12", closePrice: 900000, listPrice: 1000000, livingArea: 1000, daysOnMarket: 20, zip: "92101", type: "Condominium" },
  { month: "2026-09", closeDate: "2026-09-17", closePrice: 1100000, listPrice: 1000000, livingArea: 2000, daysOnMarket: 30, zip: "92101", type: "Condominium" },
  { month: "2026-09", closeDate: "2026-09-10", closePrice: 1300000, listPrice: 1400000, livingArea: 0, daysOnMarket: 10, zip: "92102", type: "SingleFamilyResidence" },
], 42);

const report = await getMarketReport(db, { city: "San Diego" }, new Date("2026-10-26T12:00:00Z"));
assert.deepEqual(db.calls[0].params, ["San Diego", "2024-10-01", "2026-10-01"]);
assert.match(db.calls[0].sql, /CloseDate < \?/);
assert.match(db.calls[0].sql, /ClosePrice > 0/);
assert.deepEqual(db.calls[1].params, ["San Diego"]);
assert.equal(report.summary.sales, 3);
assert.equal(report.summary.averagePrice, 1100000);
assert.equal(report.summary.medianPrice, 1100000);
assert.equal(report.summary.averagePricePerSqft, 725);
assert.equal(report.summary.averageDaysOnMarket, 20);
assert.ok(Math.abs(report.summary.listToClosePct! - 97.619) < 0.01);
assert.equal(report.monthly.length, 12);
assert.equal(report.monthsWithSales, 2);
assert.equal(report.monthly[0].month, "2025-10");
assert.equal(report.monthly[11].month, "2026-09");
assert.ok(Math.abs(report.monthOverMonthPct! - 33.333) < 0.01);
assert.equal(report.yearOverYearPct, 50);
assert.equal(report.activeListings, 42);
assert.equal(report.latestSoldDate, "2026-09-17");
assert.equal(report.byZip[0].name, "92101");
assert.equal(report.byType[0].sales, 2);
assert.match(formatMarketReport(report), /median \$1,100,000/);
assert.match(formatMarketReport(report), /Sales recorded in 2 of 12 months/);

const filtered = new FakeDb([], 3);
const empty = await getMarketReport(filtered, { city: "Irvine' OR 1=1 --", zip: "92602", type: "Condominium" }, new Date("2026-10-26"));
assert.deepEqual(filtered.calls[0].params, ["Irvine' OR 1=1 --", "2024-10-01", "2026-10-01", "92602", "Condominium"]);
assert.doesNotMatch(filtered.calls[0].sql, /OR 1=1/);
assert.deepEqual(filtered.calls[1].params, ["Irvine' OR 1=1 --", "92602", "Condominium"]);
assert.equal(empty.summary.medianPrice, null);
assert.equal(empty.yearOverYearPct, null);
assert.match(formatMarketReport(empty), /N\/A \(insufficient sales\)/);
assert.match(formatMarketReport(empty), /Average list-to-close: N\/A\n/);
await assert.rejects(getMarketReport(filtered, { city: "", zip: "92602" }), /city/);
await assert.rejects(getMarketReport(filtered, { city: "Irvine", zip: "invalid" }), /ZIP/);

console.log("Week 5 market statistics tests passed.");
