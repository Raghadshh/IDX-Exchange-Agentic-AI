import type { ListingRow, SearchPage, SoldRow } from "./search.ts";

function dollars(value: number | null): string {
  return value === null ? "Price unavailable" : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function address(street: string | null, city: string | null, zip: string | null): string {
  return [street || "Address unavailable", city, zip].filter(Boolean).join(", ");
}

function details(beds: number | null, baths: number | null, sqft: number | null): string {
  return [beds === null ? null : `${beds} bed`, baths === null ? null : `${baths} bath`, sqft === null ? null : `${Number(sqft).toLocaleString("en-US")} sq ft`]
    .filter(Boolean).join(" | ");
}

export function formatListingCard(row: ListingRow): string {
  const lines = [
    `${address(row.address, row.city, row.zip)} — ${dollars(row.price)}`,
    details(row.beds, row.baths, row.sqft),
    [row.type, row.mlsNumber ? `MLS ${row.mlsNumber}` : null, row.photoCount === null ? null : `${row.photoCount} photos`].filter(Boolean).join(" | "),
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatSoldCard(row: SoldRow): string {
  const lines = [
    `${address(row.address, row.city, row.zip)} — sold ${dollars(row.price)}`,
    [row.closeDate, details(row.beds, row.baths, row.sqft)].filter(Boolean).join(" | "),
    row.type || "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatPage<T>(result: SearchPage<T>, formatter: (row: T) => string): string {
  if (!result.rows.length) return `No matches found (page ${result.page}).`;
  const start = (result.page - 1) * result.limit + 1;
  const end = start + result.rows.length - 1;
  return [`Showing ${start}-${end} of ${result.total}`, ...result.rows.map((row, index) => `${start + index}. ${formatter(row)}`), result.hasNextPage ? `More results: use page ${result.page + 1}.` : ""].filter(Boolean).join("\n\n");
}
