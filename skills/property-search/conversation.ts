import { formatListingCard, formatPage } from "./format.ts";
import { parsePropertyQuery, type PropertyFilters } from "./parse-property-query.ts";
import { searchActiveListings, type ListingRow } from "./search.ts";
import type { SqlRunner } from "./db.ts";

export interface UserSession {
  filters: PropertyFilters;
  conversationStep: number;
  budgetAsked: boolean;
  typeAsked: boolean;
  page: number;
  lastResults: ListingRow[];
}

export function newSession(): UserSession {
  return {
    filters: parsePropertyQuery(""),
    conversationStep: 0,
    budgetAsked: false,
    typeAsked: false,
    page: 0,
    lastResults: [],
  };
}

function hasFilters(filters: PropertyFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

function mergeFilters(old: PropertyFilters, next: PropertyFilters): PropertyFilters {
  const merged = { ...old };
  for (const key of Object.keys(next) as (keyof PropertyFilters)[]) {
    if (next[key] !== null) Object.assign(merged, { [key]: next[key] });
  }
  return merged;
}

export async function replyToMessage(db: SqlRunner, current: UserSession, message: string): Promise<{ session: UserSession; reply: string }> {
  const text = message.trim();
  if (!text) return { session: current, reply: "Tell me what kind of home you're looking for." };
  if (/^(?:start over|reset|clear search)$/i.test(text)) {
    return { session: newSession(), reply: "Okay, let's start over. What city are you looking in?" };
  }

  const session: UserSession = {
    ...current,
    filters: { ...current.filters },
    conversationStep: current.conversationStep + 1,
  };
  const more = /^(?:more|next|show (?:me )?more(?: results)?|next page)$/i.test(text);
  if (more && session.page === 0) {
    return { session, reply: "I don't have a search yet. What city are you looking in?" };
  }

  let parsed = parsePropertyQuery(text);
  if (!hasFilters(parsed) && !session.filters.city && /^[a-z][a-z .'-]{1,60}$/i.test(text)
    && !/\b(?:home|house|property|results|search|budget|any|skip)\b/i.test(text)) {
    parsed = parsePropertyQuery(`homes in ${text}`);
  }
  if (hasFilters(parsed)) {
    session.filters = mergeFilters(session.filters, parsed);
    session.page = 0;
    session.lastResults = [];
  }

  if (!session.filters.city) return { session, reply: "What city are you looking in?" };

  if (session.filters.maxPrice === null && !session.budgetAsked) {
    session.budgetAsked = true;
    return { session, reply: "What is your budget? You can also say 'any budget'." };
  }
  if (/\b(?:any budget|no budget|skip budget)\b/i.test(text)) session.budgetAsked = true;

  if (session.filters.type === null && !session.typeAsked) {
    session.typeAsked = true;
    return { session, reply: "Any preference for condo, townhome, or single-family home? You can also say 'any type'." };
  }
  if (/\b(?:any type|no preference|skip type)\b/i.test(text)) session.typeAsked = true;

  if (!hasFilters(parsed) && !more && session.page > 0 && !/\b(?:show|search|find|results|any|skip|no preference)\b/i.test(text)) {
    return { session, reply: "Tell me what you want to change, or say 'more' for the next page." };
  }

  const page = more ? session.page + 1 : 1;
  const result = await searchActiveListings(db, session.filters, page, 3);
  session.page = page;
  session.lastResults = result.rows;
  const summary = result.rows.length ? formatPage(result, formatListingCard)
    : more ? "No more results. Tell me what you want to change."
      : "No matches found. Try changing the budget, property type, or other preferences.";
  return { session, reply: summary };
}
