import type { SqlRunner } from "../property-search/db.ts";

export interface MarketScope {
  city: string;
  zip?: string;
  type?: string;
}

interface SoldRecord {
  month: string;
  closeDate: string;
  closePrice: number | null;
  listPrice: number | null;
  livingArea: number | null;
  daysOnMarket: number | null;
  zip: string | null;
  type: string | null;
}

export interface MarketMetrics {
  sales: number;
  averagePrice: number | null;
  medianPrice: number | null;
  averagePricePerSqft: number | null;
  averageDaysOnMarket: number | null;
  listToClosePct: number | null;
}

export interface MonthlyMetrics extends MarketMetrics {
  month: string;
}

export interface MarketBreakdown extends MarketMetrics {
  name: string;
}

export interface MarketReport {
  scope: MarketScope;
  throughMonth: string;
  latestSoldDate: string | null;
  activeListings: number;
  summary: MarketMetrics;
  monthsWithSales: number;
  monthly: MonthlyMetrics[];
  byZip: MarketBreakdown[];
  byType: MarketBreakdown[];
  monthOverMonthPct: number | null;
  yearOverYearPct: number | null;
}

function firstOfMonth(date: Date): Date {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid report date.");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function metrics(rows: SoldRecord[]): MarketMetrics {
  const prices = rows.map((row) => row.closePrice).filter(positive);
  const pricePerSqft = rows
    .filter((row) => positive(row.closePrice) && positive(row.livingArea))
    .map((row) => row.closePrice! / row.livingArea!);
  const days = rows.map((row) => row.daysOnMarket)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const ratios = rows
    .filter((row) => positive(row.closePrice) && positive(row.listPrice))
    .map((row) => row.closePrice! / row.listPrice! * 100);
  return {
    sales: rows.length,
    averagePrice: average(prices),
    medianPrice: median(prices),
    averagePricePerSqft: average(pricePerSqft),
    averageDaysOnMarket: average(days),
    listToClosePct: average(ratios),
  };
}

function breakdown(rows: SoldRecord[], key: "zip" | "type"): MarketBreakdown[] {
  const groups = new Map<string, SoldRecord[]>();
  for (const row of rows) {
    const name = row[key]?.trim();
    if (!name) continue;
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return [...groups].map(([name, group]) => ({ name, ...metrics(group) }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}

function changePct(current: number | null, previous: number | null): number | null {
  return current !== null && previous !== null && previous > 0
    ? (current / previous - 1) * 100 : null;
}

export async function getMarketReport(db: SqlRunner, scope: MarketScope, asOf = new Date()): Promise<MarketReport> {
  const city = scope.city.trim();
  const zip = scope.zip?.trim();
  const type = scope.type?.trim();
  if (!city || city.length > 100) throw new Error("Provide a California city with --city.");
  if (zip && !/^\d{5}$/.test(zip)) throw new Error("ZIP must be five digits.");
  if (type && type.length > 100) throw new Error("Property type is too long.");

  // Use completed months so a partial current month does not distort trends.
  const end = firstOfMonth(asOf);
  const start = shiftMonth(end, -12);
  const historyStart = shiftMonth(end, -24);
  const soldWhere = [
    "City = ?", "PropertyType = 'Residential'", "CloseDate >= ?", "CloseDate < ?", "ClosePrice > 0",
  ];
  const soldParams: (string | number)[] = [city, dateKey(historyStart), dateKey(end)];
  const activeWhere = ["L_City = ?", "L_Status = 'Active'"];
  const activeParams: (string | number)[] = [city];
  if (zip) {
    soldWhere.push("PostalCode = ?");
    soldParams.push(zip);
    activeWhere.push("L_Zip = ?");
    activeParams.push(zip);
  }
  if (type) {
    soldWhere.push("PropertySubType = ?");
    soldParams.push(type);
    activeWhere.push("L_Type_ = ?");
    activeParams.push(type);
  }

  const sold = await db.query<SoldRecord>(`
    SELECT DATE_FORMAT(CloseDate, '%Y-%m') AS month,
      DATE_FORMAT(CloseDate, '%Y-%m-%d') AS closeDate,
      ClosePrice AS closePrice, ListPrice AS listPrice, LivingArea AS livingArea,
      DaysOnMarket AS daysOnMarket, PostalCode AS zip, PropertySubType AS type
    FROM california_sold
    WHERE ${soldWhere.join(" AND ")}
  `, soldParams);
  const active = await db.query<{ total: number }>(`
    SELECT COUNT(*) AS total FROM rets_property WHERE ${activeWhere.join(" AND ")}
  `, activeParams);

  const startKey = monthKey(start);
  const currentRows = sold.filter((row) => row.month >= startKey);
  const monthly: MonthlyMetrics[] = Array.from({ length: 12 }, (_, index) => {
    const month = monthKey(shiftMonth(start, index));
    return { month, ...metrics(currentRows.filter((row) => row.month === month)) };
  });
  const latest = monthly[11];
  const previous = monthly[10];
  const yearAgo = sold.filter((row) => row.month === monthKey(shiftMonth(end, -13)));

  return {
    scope: { city, ...(zip ? { zip } : {}), ...(type ? { type } : {}) },
    throughMonth: latest.month,
    latestSoldDate: currentRows.map((row) => row.closeDate).sort().at(-1) ?? null,
    activeListings: Number(active[0]?.total ?? 0),
    summary: metrics(currentRows),
    monthsWithSales: monthly.filter((month) => month.sales > 0).length,
    monthly,
    byZip: breakdown(currentRows, "zip"),
    byType: breakdown(currentRows, "type"),
    monthOverMonthPct: changePct(latest.averagePrice, previous.averagePrice),
    yearOverYearPct: changePct(latest.averagePrice, metrics(yearAgo).averagePrice),
  };
}

function money(value: number | null): string {
  return value === null ? "N/A" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function decimal(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(1);
}

function percentage(value: number | null): string {
  return value === null ? "N/A (insufficient sales)" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatMarketReport(report: MarketReport): string {
  const { scope, summary } = report;
  const location = [scope.city, scope.zip, scope.type].filter(Boolean).join(" / ");
  const lines = [
    `${location} market — 12 completed months through ${report.throughMonth}`,
    `Sold: ${summary.sales} | Active listings: ${report.activeListings} (rets_property)`,
    `Close price: average ${money(summary.averagePrice)}, median ${money(summary.medianPrice)}`,
    `Average price/sq ft: ${money(summary.averagePricePerSqft)} | Average DOM: ${decimal(summary.averageDaysOnMarket)}`,
    `Average list-to-close: ${summary.listToClosePct === null ? "N/A" : `${decimal(summary.listToClosePct)}%`}`,
    `Average close price change: MoM ${percentage(report.monthOverMonthPct)} | YoY ${percentage(report.yearOverYearPct)}`,
    `Latest sold record: ${report.latestSoldDate ?? "N/A"}; recent months may be incomplete if the feed is delayed.`,
    `Sales recorded in ${report.monthsWithSales} of 12 months; missing months are not estimated.`,
    "12-month trend (sales / average close / average $/sq ft / average DOM):",
    ...report.monthly.map((month) =>
      `${month.month}: ${month.sales} / ${money(month.averagePrice)} / ${money(month.averagePricePerSqft)} / ${decimal(month.averageDaysOnMarket)}`),
  ];
  if (report.byZip.length) {
    lines.push("By ZIP (top 3 by sales):");
    lines.push(...report.byZip.slice(0, 3).map((item) =>
      `${item.name}: ${item.sales} sold, avg ${money(item.averagePrice)}, median ${money(item.medianPrice)}`));
  }
  if (report.byType.length) {
    lines.push("By property type (top 3 by sales):");
    lines.push(...report.byType.slice(0, 3).map((item) =>
      `${item.name}: ${item.sales} sold, avg ${money(item.averagePrice)}, median ${money(item.medianPrice)}`));
  }
  return lines.join("\n");
}
