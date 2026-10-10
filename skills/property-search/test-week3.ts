import assert from "node:assert/strict";
import type { SqlRunner } from "./db.ts";
import { formatListingCard, formatPage, formatSoldCard } from "./format.ts";
import { parsePropertyQuery } from "./parse-property-query.ts";
import { searchActiveListings, searchSoldComps, type ListingRow, type SoldRow } from "./search.ts";

class FakeDb implements SqlRunner {
  calls: { sql: string; params: (string | number)[] }[] = [];
  private readonly rows: unknown[];
  constructor(rows: unknown[]) { this.rows = rows; }
  async query<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    return (sql.includes("COUNT(*)") ? [{ total: this.rows.length }] : this.rows) as T[];
  }
}

const listing: ListingRow = {
  listingId: "123", mlsNumber: "OC123", address: "1 Main St", city: "Irvine", zip: "92602",
  price: 1250000, beds: 3, baths: 2.5, sqft: 1800, type: "Condominium", status: "Active",
  photoCount: 12, yearBuilt: 2000, hoa: 300, daysOnMarket: 8,
};

const db = new FakeDb([listing]);
const filters = parsePropertyQuery("3-bedroom condos in Irvine under $1.5M with a pool and view, HOA under $400");
const page = await searchActiveListings(db, filters, 1, 10);
assert.equal(page.total, 1);
assert.equal(page.hasNextPage, false);
assert.deepEqual(db.calls[0].params, ["Irvine", 1500000, 3, "Condominium", 400]);
assert.deepEqual(db.calls[1].params, ["Irvine", 1500000, 3, "Condominium", 400, 10, 0]);
assert.match(db.calls[1].sql, /L_Status = 'Active'/);
assert.match(db.calls[1].sql, /LOWER\(PoolPrivateYN\) IN \('1', 'true', 'yes'\)/);
assert.match(db.calls[1].sql, /LOWER\(ViewYN\) IN \('1', 'true', 'yes'\)/);
assert.match(db.calls[1].sql, /AssociationFeeFrequency WHEN 'Monthly' THEN AssociationFee/);
assert.match(db.calls[1].sql, /WHEN 'Annually' THEN AssociationFee \/ 12/);
assert.match(db.calls[1].sql, /ORDER BY L_SystemPrice ASC, id ASC LIMIT \? OFFSET \?/);
assert.doesNotMatch(db.calls[1].sql, /Irvine/);
assert.match(formatListingCard(listing), /1 Main St, Irvine, 92602 — \$1,250,000/);
assert.match(formatPage(page, formatListingCard), /12 photos/);

const injection = new FakeDb([]);
await searchActiveListings(injection, { ...filters, city: "Irvine' OR 1=1 --" });
assert.doesNotMatch(injection.calls[1].sql, /OR 1=1/);
assert.equal(injection.calls[1].params[0], "Irvine' OR 1=1 --");

const sold: SoldRow = {
  listingId: "321", address: "2 Oak St", city: "Irvine", zip: "92602", closeDate: "2026-09-17",
  price: 1100000, beds: 3, baths: 2, sqft: 1700, type: "Townhouse", daysOnMarket: 20,
};
const soldDb = new FakeDb([sold]);
const soldPage = await searchSoldComps(soldDb, "Irvine", 12, 2, 5);
assert.deepEqual(soldDb.calls[1].params, ["Irvine", 12, 5, 5]);
assert.match(soldDb.calls[1].sql, /FROM california_sold/);
assert.match(soldDb.calls[1].sql, /CloseDate <= DATE_FORMAT\(CURDATE\(\), '%Y-%m-%d'\)/);
assert.match(formatSoldCard(sold), /sold \$1,100,000/);
assert.equal(soldPage.page, 2);

await assert.rejects(searchActiveListings(new FakeDb([]), filters, 0), /Page/);
assert.throws(() => searchSoldComps(new FakeDb([]), "", 12), /city/);
assert.throws(() => searchSoldComps(new FakeDb([]), "Irvine", 0), /Months/);
await assert.rejects(searchActiveListings(new FakeDb([]), filters, 1, 100), /Limit/);

console.log("Week 3 query, pagination, and card tests passed.");
