import type { H3Event } from "h3";

/**
 * Reads a numeric route parameter, rejecting anything that is not a usable id.
 *
 * `Number()` is deliberately strict here in a way the previous inline copies
 * were not. It rejects an empty or non-numeric segment as NaN, and the
 * `!Number.isInteger` check additionally rejects `1.5` and `1e999`, neither of
 * which can match a row but both of which `Number()` alone accepts. Zero is
 * rejected because the id columns autoincrement from one.
 *
 * Replaces the same two lines repeated across roughly twenty admin handlers.
 */
export function getRouterId(event: H3Event, name = "id"): number {
  const id = Number(getRouterParam(event, name));
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${name}` });
  }
  return id;
}

/**
 * Reads a required string route parameter, such as a restroom slug.
 */
export function getRouterString(event: H3Event, name: string): string {
  const value = getRouterParam(event, name);
  if (!value) {
    throw createError({ statusCode: 400, statusMessage: `Missing ${name}` });
  }
  return value;
}
