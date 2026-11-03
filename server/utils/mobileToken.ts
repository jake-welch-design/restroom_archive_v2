import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { useDb, schema } from "~~/server/utils/db";
import { generateToken, hashToken } from "~~/server/utils/hash";

// Native mobile clients authenticate with opaque bearer tokens stored in the
// iOS Keychain rather than browser cookies. Only the SHA-256 digest is persisted
// in D1 so a database read cannot be replayed as a live credential.
export const MOBILE_TOKEN_TTL_DAYS = 90;

export function extractBearerToken(event: H3Event): string | null {
  const header = getHeader(event, "authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? match[1].toLowerCase() : null;
}

export async function issueMobileToken(
  event: H3Event,
  userId: number,
  label?: string,
): Promise<{ token: string; expiresAt: string }> {
  const db = useDb(event);
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + MOBILE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  await db.insert(schema.apiTokens).values({
    userId,
    tokenHash: hashToken(token),
    label: label?.trim() || null,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function revokeMobileToken(
  event: H3Event,
  rawToken: string,
): Promise<void> {
  const db = useDb(event);
  await db
    .delete(schema.apiTokens)
    .where(eq(schema.apiTokens.tokenHash, hashToken(rawToken)));
}

