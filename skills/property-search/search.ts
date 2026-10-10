import type { SqlRunner } from "./db.ts";
import type { PropertyFilters } from "./parse-property-query.ts";

export interface ListingRow {
  listingId: string | null;
  mlsNumber: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string | null;
  status: string | null;
  photoCount: number | null;
  yearBuilt: number | null;
  hoa: number | null;
  daysOnMarket: number | null;
}

export interface SoldRow {
  listingId: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  closeDate: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string | null;
  daysOnMarket: number | null;
}

export interface SearchPage<T> {
  rows: T[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
}

const listingColumns = `
  L_ListingID AS listingId, L_DisplayId AS mlsNumber,
  L_Address AS address, L_City AS city, L_Zip AS zip,
  L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths,
  LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status,
  PhotoCount AS photoCount, YearBuilt AS yearBuilt,
  AssociationFee AS hoa, DaysOnMarket AS daysOnMarket`;

const soldColumns = `
  CAST(ListingKey AS CHAR) AS listingId, UnparsedAddress AS address,
  City AS city, PostalCode AS zip, CloseDate AS closeDate,
  ClosePrice AS price, BedroomsTotal AS beds,
  BathroomsTotalInteger AS baths, LivingArea AS sqft,
  PropertySubType AS type, DaysOnMarket AS daysOnMarket`;

function pagination(page: number, limit: number): number {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Page must be a positive integer.");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
    throw new Error("Limit must be an integer from 1 to 25.");
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new Error("Page is too large.");
  return offset;
}

function addNumber(clauses: string[], params: (string | number)[], column: string, operator: string, value: number | null): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${column} filter.`);
  clauses.push(`${column} ${operator} ?`);
  params.push(value);
}

function addFlag(clauses: string[], column: string, value: "True" | "False" | null): void {
  if (value === null) return;
  clauses.push(`LOWER(${column}) IN (${value === "True" ? "'1', 'true', 'yes'" : "'0', 'false', 'no'"})`);
}

function activeWhere(filters: PropertyFilters): { where: string; params: (string | number)[] } {
  const clauses = ["L_Status = 'Active'"];
  const params: (string | number)[] = [];
  if (filters.city) {
    clauses.push("L_City = ?");
    params.push(filters.city);
  }
  addNumber(clauses, params, "L_SystemPrice", "<=", filters.maxPrice);
  addNumber(clauses, params, "L_Keyword2", ">=", filters.beds);
  addNumber(clauses, params, "LM_Dec_3", ">=", filters.baths);
  addNumber(clauses, params, "LM_Int2_3", ">=", filters.sqft);
  if (filters.type) {
    clauses.push("L_Type_ = ?");
    params.push(filters.type);
  }
  addFlag(clauses, "PoolPrivateYN", filters.pool);
  addFlag(clauses, "ViewYN", filters.hasView);
  if (filters.maxHOA !== null) {
    if (!Number.isFinite(filters.maxHOA) || filters.maxHOA < 0) throw new Error("Invalid HOA filter.");
    clauses.push("(AssociationFee = 0 OR CASE AssociationFeeFrequency WHEN 'Monthly' THEN AssociationFee WHEN 'Quarterly' THEN AssociationFee / 3 WHEN 'SemiAnnually' THEN AssociationFee / 6 WHEN 'Annually' THEN AssociationFee / 12 ELSE NULL END <= ?)");
    params.push(filters.maxHOA);
  }
  return { where: clauses.join(" AND "), params };
}

async function getPage<T>(db: SqlRunner, table: string, columns: string, where: string, params: (string | number)[], order: string, page: number, limit: number): Promise<SearchPage<T>> {
  const offset = pagination(page, limit);
  const count = await db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, params);
  const rows = await db.query<T>(`SELECT ${columns} FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = Number(count[0]?.total ?? 0);
  return { rows, page, limit, total, hasNextPage: offset + rows.length < total };
}

export function searchActiveListings(db: SqlRunner, filters: PropertyFilters, page = 1, limit = 10): Promise<SearchPage<ListingRow>> {
  const { where, params } = activeWhere(filters);
  return getPage(db, "rets_property", listingColumns, where, params, "L_SystemPrice ASC, id ASC", page, limit);
}

export function searchSoldComps(db: SqlRunner, city: string, months = 12, page = 1, limit = 10): Promise<SearchPage<SoldRow>> {
  if (!city.trim()) throw new Error("A city is required to search sold comps.");
  if (!Number.isSafeInteger(months) || months < 1 || months > 120) {
    throw new Error("Months must be an integer from 1 to 120.");
  }
  const where = "City = ? AND PropertyType = 'Residential' AND CloseDate >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m-%d') AND CloseDate <= DATE_FORMAT(CURDATE(), '%Y-%m-%d')";
  return getPage(db, "california_sold", soldColumns, where, [city.trim(), months], "CloseDate DESC, ListingKey DESC", page, limit);
}
