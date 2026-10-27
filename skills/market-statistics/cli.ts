import { closeDatabase, database } from "../property-search/db.ts";
import { formatMarketReport, getMarketReport } from "./market.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const city = argument("--city");
  if (!city) throw new Error("Use --city <California city> [--zip 5-digit ZIP] [--type property type].");
  const report = await getMarketReport(database, {
    city,
    zip: argument("--zip"),
    type: argument("--type"),
  });
  console.log(formatMarketReport(report));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(closeDatabase);
