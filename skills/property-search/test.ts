import { parsePropertyQuery, type PropertyFilters } from "./parse-property-query.ts";

const empty: PropertyFilters = {
  city: null, maxPrice: null, beds: null, baths: null, sqft: null,
  type: null, pool: null, hasView: null, maxHOA: null,
};

const cases: { query: string; expected: Partial<PropertyFilters> }[] = [
  {
    query: "Show me 3-bedroom condos in Irvine under $1.5M with a pool.",
    expected: { city: "Irvine", maxPrice: 1500000, beds: 3, type: "Condominium", pool: "True" },
  },
  {
    query: "Find townhomes in Newport Beach below $900k with 2 beds and 2 baths",
    expected: { city: "Newport Beach", maxPrice: 900000, beds: 2, baths: 2, type: "Townhouse" },
  },
  {
    query: "Single family homes in Los Angeles up to $1,500,000, at least 4 bedrooms and 3 bathrooms",
    expected: { city: "Los Angeles", maxPrice: 1500000, beds: 4, baths: 3, type: "SingleFamilyResidence" },
  },
  {
    query: "Land in San Diego under 1500000",
    expected: { city: "San Diego", maxPrice: 1500000, type: "UnimprovedLand" },
  },
  {
    query: "Condominium near Laguna Beach with an ocean view and HOA under $400",
    expected: { city: "Laguna Beach", type: "Condominium", hasView: "True", maxHOA: 400 },
  },
  {
    query: "I need a townhouse in Anaheim with at least 1,800 sqft and no pool",
    expected: { city: "Anaheim", type: "Townhouse", sqft: 1800, pool: "False" },
  },
  {
    query: "3 bed 2.5 bath single-family home around Pasadena under $2M, HOA below $250",
    expected: { city: "Pasadena", maxPrice: 2000000, beds: 3, baths: 2.5, type: "SingleFamilyResidence", maxHOA: 250 },
  },
  {
    query: "Vacant land in Riverside for less than $750,000",
    expected: { city: "Riverside", maxPrice: 750000, type: "UnimprovedLand" },
  },
  {
    query: "Show condos in Santa Monica with 1200 square feet, views, and a pool",
    expected: { city: "Santa Monica", sqft: 1200, type: "Condominium", hasView: "True", pool: "True" },
  },
  {
    query: "Townhouse in Long Beach under $950,000 with 2+ beds, 1.5 baths, without a view, HOA under $350",
    expected: { city: "Long Beach", maxPrice: 950000, beds: 2, baths: 1.5, type: "Townhouse", hasView: "False", maxHOA: 350 },
  },
  {
    query: "A condo in Costa Mesa with 900 sq ft and an association fee of $300",
    expected: { city: "Costa Mesa", sqft: 900, type: "Condominium", maxHOA: 300 },
  },
  {
    query: "Find a 4 br, 3 ba single family residence in Sacramento with a private pool and mountain view, max price $1.25 million",
    expected: { city: "Sacramento", maxPrice: 1250000, beds: 4, baths: 3, type: "SingleFamilyResidence", pool: "True", hasView: "True" },
  },
  {
    query: "Homes in Fresno under $650k, minimum 2,000 sqft, no pool, no view, HOA under $100",
    expected: { city: "Fresno", maxPrice: 650000, sqft: 2000, pool: "False", hasView: "False", maxHOA: 100 },
  },
  {
    query: "Just browsing properties",
    expected: {},
  },
];

let failures = 0;
for (const [index, { query, expected }] of cases.entries()) {
  const actual = parsePropertyQuery(query);
  const wanted = { ...empty, ...expected };
  const passed = JSON.stringify(actual) === JSON.stringify(wanted);
  console.log(`${index + 1}. ${query}`);
  console.log(JSON.stringify(actual));
  console.log(passed ? "PASS" : `FAIL expected ${JSON.stringify(wanted)}`);
  if (!passed) failures++;
}

if (failures) throw new Error(`${failures} of ${cases.length} property query tests failed`);
console.log(`All ${cases.length} property query tests passed.`);
