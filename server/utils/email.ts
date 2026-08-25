import { escapeHtml } from "~~/shared/utils/html";

const FROM_EMAIL = "noreply@restroomarchive.com";
const FROM_NAME = "The Restroom Archive";
const HEADER_IMG =
  "https://pub-1b76864877c9442db2b46c539ae89ecc.r2.dev/assets/metatag.png";
const CONTACT_EMAIL = "hello@restroomarchive.com";

function siteUrl() {
  return useRuntimeConfig().public.siteUrl || "https://restroomarchive.com";
}

function template(body: string) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e0e0e0">
          <tr><td>
            <img src="${HEADER_IMG}" width="560" alt="The Restroom Archive"
              style="display:block;width:100%;max-width:560px;height:auto;margin:0 0 24px" />
            ${body}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function send(to: string, subject: string, html: string) {
  const apiKey = useRuntimeConfig().plunkApiKey;
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "Email service is not configured.",
    });
  }

  const res = await fetch("https://next-api.useplunk.com/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      subject,
      body: html,
      subscribed: true,
      name: FROM_NAME,
      from: FROM_EMAIL,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw createError({
      statusCode: 500,
      statusMessage: `Email send failed: ${res.status} ${body}`,
    });
  }
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await send(
    to,
    "Reset your Restroom Archive password",
    template(`
      <p style="text-align:center;font-size:20px;font-weight:400;color:#000;margin:40px 0 20px">
        Reset your password
      </p>
      <hr style="border:solid 0.5px #000;width:90%" />
      <p style="text-align:center;padding:0 20px;font-size:14px;color:#000;margin:20px 0 30px">
        We received a request to reset your password. Click the link below to set a new one. The link expires in 1 hour.
      </p>
      <p style="text-align:center;margin:20px 20px 30px">
        <a href="${link}" style="color:#fff;background-color:#000;font-size:14px;padding:8px 16px;text-decoration:none;border-radius:3px">
          Reset My Password
        </a>
      </p>
      <p style="text-align:center;font-size:12px;color:#999;margin:0 0 30px">
        If you didn't request this, you can ignore this email — your password won't change.
      </p>
    `),
  );
}

export async function sendContactEmail(opts: {
  name: string;
  email: string;
  subject: string;
  body: string;
}) {
  await send(
    CONTACT_EMAIL,
    `[Contact] ${opts.subject}`,
    template(`
      <p style="text-align:center;font-size:20px;font-weight:400;color:#000;margin:40px 0 20px">
        New contact form submission
      </p>
      <hr style="border:solid 0.5px #000;width:90%" />
      <table cellpadding="0" cellspacing="0" style="width:90%;margin:20px auto 0;font-size:14px;color:#000">
        <tr><td style="padding:4px 0;color:#999;width:80px">From</td><td style="padding:4px 0">${escapeHtml(opts.name)} &lt;${escapeHtml(opts.email)}&gt;</td></tr>
        <tr><td style="padding:4px 0;color:#999">Subject</td><td style="padding:4px 0">${escapeHtml(opts.subject)}</td></tr>
      </table>
      <p style="white-space:pre-wrap;padding:0 20px;font-size:14px;color:#000;margin:20px 20px 30px;line-height:1.5">${escapeHtml(opts.body)}</p>
    `),
  );
}
