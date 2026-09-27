import { parsePropertyQuery } from "./parse-property-query.ts";

declare const process: { argv: string[] };
const query = process.argv.slice(2).join(" ");
if (!query) throw new Error("Pass a natural-language property query as an argument.");
console.log(JSON.stringify(parsePropertyQuery(query), null, 2));
