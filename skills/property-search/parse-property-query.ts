export interface PropertyFilters {
  city: string | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: "Condominium" | "Townhouse" | "SingleFamilyResidence" | "UnimprovedLand" | null;
  pool: "True" | "False" | null;
  hasView: "True" | "False" | null;
  maxHOA: number | null;
}

const amount = String.raw`\$?\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|m|k)?\b`;

function readAmount(value: string, unit: string | undefined): number {
  const multiplier = unit === "m" || unit === "million" ? 1_000_000
    : unit === "k" || unit === "thousand" ? 1_000 : 1;
  return Number(value.replaceAll(",", "")) * multiplier;
}

function matchAmount(query: string, pattern: RegExp): number | null {
  const match = query.match(pattern);
  return match ? readAmount(match[1], match[2]?.toLowerCase()) : null;
}

/** Turns one property search into filters. Missing details stay null. */
export function parsePropertyQuery(query: string): PropertyFilters {
  const text = query.trim();
  const lower = text.toLowerCase();

  // Pick up the city after words like "in" or "near".
  const cityMatch = text.match(/\b(?:in|near|around|city of)\s+([a-z][a-z .'-]*?)(?=\s+(?:for\s+less\s+than|under|below|less than|up to|with|without|at least|over|above|minimum|min\b|max\b|no more than|that|which|and\b|hoa\b|\d)|[,.;!?]|$)/i);
  const city = cityMatch?.[1].trim().replace(/\s+/g, " ") ?? null;

  // Read prices like 900k, 1.5M, or 1,500,000.
  const pricePattern = new RegExp(String.raw`\b(?:under|below|less than|up to|no more than|max(?:imum)?(?: price)?(?: of)?|budget(?: of)?)\s*${amount}`, "gi");
  const priceMatch = [...lower.matchAll(pricePattern)].find((match) =>
    !/\b(?:hoa|association\s+(?:fee|dues))\s*$/.test(lower.slice(0, match.index))
    && !/^\s*(?:hoa|association\s+(?:fee|dues))\b/.test(lower.slice(match.index + match[0].length))
  );
  const price = priceMatch ? readAmount(priceMatch[1], priceMatch[2]?.toLowerCase()) : null;
  const hoa = matchAmount(lower, new RegExp(String.raw`\b(?:hoa|association\s+(?:fee|dues))\s*(?:under|below|less than|up to|no more than|of|:)?\s*${amount}`, "i"))
    ?? matchAmount(lower, new RegExp(String.raw`\b(?:under|below|less than|up to|no more than)\s*${amount}\s*(?:per\s+month\s*)?(?:hoa|association\s+(?:fee|dues))\b`, "i"));

  const bedMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:\+|-)?\s*(?:bedrooms?|beds?|br)\b/);
  const bathMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:\+|-)?\s*(?:bathrooms?|baths?|ba)\b/);
  const sqftMatch = lower.match(/\b([\d,]+)\s*(?:\+\s*)?(?:sq\.?\s*ft\.?|sqft|square\s*feet)\b/);

  let type: PropertyFilters["type"] = null;
  if (/\b(?:condos?|condominiums?)\b/.test(lower)) type = "Condominium";
  else if (/\b(?:townhomes?|townhouses?)\b/.test(lower)) type = "Townhouse";
  else if (/\b(?:single[ -]family(?:\s+(?:homes?|residences?))?|sfh)\b/.test(lower)) type = "SingleFamilyResidence";
  else if (/\b(?:unimproved\s+land|vacant\s+land|land\s+(?:lots?|parcels?)|land)\b/.test(lower)) type = "UnimprovedLand";

  // Keep "no pool" and "no view" as "False".
  const pool = /\b(?:no|without)\s+(?:a\s+|an\s+)?(?:private\s+)?pool\b/.test(lower) ? "False"
    : /\bpool\b/.test(lower) ? "True" : null;
  const hasView = /\b(?:no|without)\s+(?:a\s+|an\s+)?(?:\w+\s+)?view\b/.test(lower) ? "False"
    : /\bviews?\b/.test(lower) ? "True" : null;

  return {
    city,
    maxPrice: price,
    beds: bedMatch ? Number(bedMatch[1]) : null,
    baths: bathMatch ? Number(bathMatch[1]) : null,
    sqft: sqftMatch ? Number(sqftMatch[1].replaceAll(",", "")) : null,
    type,
    pool,
    hasView,
    maxHOA: hoa,
  };
}
