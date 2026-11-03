import {
  extractBearerToken,
  revokeMobileToken,
} from "~~/server/utils/mobileToken";

export default defineEventHandler(async (event) => {
  const token = extractBearerToken(event);
  if (token) {
    await revokeMobileToken(event, token);
  }
  return { ok: true };
});

