import { database, closeDatabase } from "./db.ts";
import { formatListingCard, formatPage, formatSoldCard } from "./format.ts";
import { parsePropertyQuery } from "./parse-property-query.ts";
import { searchActiveListings, searchSoldComps } from "./search.ts";

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} needs an integer.`);
  return value;
}

async function main(): Promise<void> {
  const mode = process.argv.includes("--sold") ? "sold" : "active";
  const query = process.argv.slice(2).filter((part, index, args) =>
    part !== "--sold" && part !== "--page" && part !== "--limit" && part !== "--months"
    && args[index - 1] !== "--page" && args[index - 1] !== "--limit" && args[index - 1] !== "--months"
  ).join(" ").trim();
  if (!query) throw new Error("Pass a property search sentence in quotes.");
  const filters = parsePropertyQuery(query);
  const page = option("--page", 1);
  const limit = option("--limit", 10);
  if (mode === "sold") {
    if (!filters.city) throw new Error("Sold comps need a city, for example: 'sold homes in Irvine'.");
    const result = await searchSoldComps(database, filters.city, option("--months", 12), page, limit);
    console.log(formatPage(result, formatSoldCard));
  } else {
    const result = await searchActiveListings(database, filters, page, limit);
    console.log(formatPage(result, formatListingCard));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(closeDatabase);
