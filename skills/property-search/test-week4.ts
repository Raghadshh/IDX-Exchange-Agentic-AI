import assert from "node:assert/strict";
import type { SqlRunner } from "./db.ts";
import { newSession, replyToMessage } from "./conversation.ts";
import type { ListingRow } from "./search.ts";

const listing: ListingRow = {
  listingId: "123", mlsNumber: "OC123", address: "1 Main St", city: "Irvine", zip: "92602",
  price: 1100000, beds: 3, baths: 2, sqft: 1700, type: "SingleFamilyResidence", status: "Active",
  photoCount: 12, yearBuilt: 2001, hoa: 0, daysOnMarket: 5,
};

class FakeDb implements SqlRunner {
  calls: { sql: string; params: (string | number)[] }[] = [];
  async query<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    return (sql.includes("COUNT(*)") ? [{ total: 4 }] : [listing]) as T[];
  }
}

const db = new FakeDb();
let result = await replyToMessage(db, newSession(), "Find homes in Irvine");
assert.match(result.reply, /budget/i);
assert.equal(result.session.filters.city, "Irvine");
result = await replyToMessage(db, result.session, "Under $1.2M");
assert.match(result.reply, /condo, townhome/i);
assert.equal(result.session.filters.maxPrice, 1200000);
result = await replyToMessage(db, result.session, "Single family with at least 3 beds");
assert.match(result.reply, /1 Main St, Irvine, 92602/);
assert.match(result.reply, /12 photos/);
assert.deepEqual(db.calls[1].params, ["Irvine", 1200000, 3, "SingleFamilyResidence", 3, 0]);
assert.equal(result.session.lastResults.length, 1);

result = await replyToMessage(db, result.session, "more");
assert.deepEqual(db.calls[3].params, ["Irvine", 1200000, 3, "SingleFamilyResidence", 3, 3]);
assert.equal(result.session.page, 2);

result = await replyToMessage(db, result.session, "under $900k");
assert.equal(result.session.filters.maxPrice, 900000);
assert.deepEqual(db.calls[5].params, ["Irvine", 900000, 3, "SingleFamilyResidence", 3, 0]);

const other = await replyToMessage(db, newSession(), "homes in Pasadena under $2M with a pool");
assert.equal(other.session.filters.city, "Pasadena");
assert.equal(result.session.filters.city, "Irvine");
assert.match(other.reply, /condo, townhome/i);

let short = await replyToMessage(db, newSession(), "Irvine");
assert.match(short.reply, /budget/i);
short = await replyToMessage(db, short.session, "any budget");
assert.match(short.reply, /condo, townhome/i);
short = await replyToMessage(db, short.session, "any type");
assert.match(short.reply, /1 Main St/);

const reset = await replyToMessage(db, result.session, "start over");
assert.equal(reset.session.filters.city, null);
assert.equal(reset.session.lastResults.length, 0);
assert.equal(reset.session.conversationStep, 0);

console.log("Week 4 conversation tests passed.");
