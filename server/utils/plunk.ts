import type { H3Event } from "h3";

/**
 * Plunk's management API: contacts and campaigns, for the Weekly Report.
 * Transactional mail goes through server/utils/email.ts instead.
 *
 * Every call needs the secret key (`sk_…`), the same NUXT_PLUNK_API_KEY the
 * transactional mail uses, so none of this can run from the browser.
 */
const API = "https://next-api.useplunk.com";

export function plunkConfigured(event: H3Event): boolean {
  return !!useRuntimeConfig(event).plunkApiKey;
}

export async function plunk<T = unknown>(
  event: H3Event,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const key = useRuntimeConfig(event).plunkApiKey;
  if (!key)
    throw createError({
      statusCode: 503,
      statusMessage: "Email service is not configured.",
    });

  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Plunk ${init.method ?? "GET"} ${path} failed: ${res.status} ${text.slice(0, 300)}`,
    });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/**
 * The newsletter's audience: contacts who confirmed a Weekly Report signup and
 * have not unsubscribed since.
 *
 * Not simply "every subscribed contact". Transactional mail (password resets,
 * contact-form receipts) creates Plunk contacts too, and older sends marked
 * them subscribed, so `subscribed` alone would mail people who never asked for
 * the newsletter. `data.weeklyReport` is only ever set by the confirm step.
 * Unsubscribing through Plunk's link clears `subscribed`, which drops them out.
 */
export const WEEKLY_REPORT_AUDIENCE = {
  logic: "AND",
  groups: [
    {
      filters: [
        { field: "data.weeklyReport", operator: "equals", value: true },
        { field: "subscribed", operator: "equals", value: true },
      ],
    },
  ],
};
