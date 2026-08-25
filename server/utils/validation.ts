import type { H3Event } from "h3";
import type { z } from "zod";

/**
 * Validates a request body that the client is allowed to omit entirely.
 *
 * Several admin actions take only optional fields, such as a message to attach
 * to the notification. Clients that have nothing to send omit the body, and
 * `readValidatedBody` then hands the schema `null`, which fails validation for
 * a reason that has nothing to do with the request being wrong.
 *
 * Treating a null body as `{}` lets the schema decide what is optional, which
 * is where that decision belongs.
 *
 * @param schema Must accept an empty object, or an omitted body will still be
 *   rejected. That is the correct outcome when a field is genuinely required.
 */
export async function readOptionalBody<T extends z.ZodTypeAny>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  return await readValidatedBody(event, (raw) => schema.parse(raw ?? {}));
}
