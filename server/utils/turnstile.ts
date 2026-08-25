import type { H3Event } from "h3";

export async function verifyTurnstile(
  event: H3Event,
  token: string,
): Promise<boolean> {
  const secret = useRuntimeConfig(event).turnstileSecretKey as string;
  // Skip verification in dev when no secret is configured
  if (!secret) return true;

  const ip = getRequestHeader(event, "CF-Connecting-IP");
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
