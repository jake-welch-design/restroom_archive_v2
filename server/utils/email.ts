const FROM_EMAIL = 'noreply@restroomarchive.com'
const FROM_NAME = 'The Restroom Archive'
const HEADER_IMG = 'https://pub-1b76864877c9442db2b46c539ae89ecc.r2.dev/assets/metatag.png'

function siteUrl() {
  return useRuntimeConfig().public.siteUrl || 'https://restroomarchive.com'
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
</html>`
}

async function send(to: string, subject: string, html: string) {
  const apiKey = useRuntimeConfig().plunkApiKey
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Email service is not configured.' })
  }

  const res = await fetch('https://next-api.useplunk.com/v1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw createError({ statusCode: 500, statusMessage: `Email send failed: ${res.status} ${body}` })
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendBetaApplicationNotification(application: {
  email: string
  displayName?: string | null
  socials?: string | null
  foundVia?: string | null
  reason: string
}) {
  const to = useRuntimeConfig().adminEmail
  if (!to) {
    // No admin recipient configured — nothing to notify. Treated as non-fatal by callers.
    throw createError({ statusCode: 500, statusMessage: 'Admin email is not configured.' })
  }
  const optional = (value?: string | null) => (value ? escapeHtml(value) : '—')
  await send(
    to,
    'New beta-archivist application',
    template(`
      <p style="text-align:center;font-size:20px;font-weight:400;color:#000;margin:40px 0 20px">
        New beta-archivist application
      </p>
      <hr style="border:solid 0.5px #000;width:90%" />
      <table cellpadding="0" cellspacing="0" style="width:90%;margin:20px auto;font-size:14px;color:#000">
        <tr><td style="padding:6px 0;font-weight:600;vertical-align:top;width:130px">Email</td><td style="padding:6px 0">${escapeHtml(application.email)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;vertical-align:top">Name</td><td style="padding:6px 0">${optional(application.displayName)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;vertical-align:top">Socials</td><td style="padding:6px 0;white-space:pre-wrap">${optional(application.socials)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;vertical-align:top">Found us via</td><td style="padding:6px 0;white-space:pre-wrap">${optional(application.foundVia)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;vertical-align:top">Why an archivist</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(application.reason)}</td></tr>
      </table>
      <p style="text-align:center;margin:20px 20px 30px">
        <a href="${siteUrl()}/account" style="color:#fff;background-color:#000;font-size:14px;padding:8px 16px;text-decoration:none;border-radius:3px">
          Review Applications
        </a>
      </p>
    `),
  )
}

export async function sendBetaInviteEmail(to: string, token: string) {
  const link = `${siteUrl()}/join?token=${encodeURIComponent(token)}`
  await send(
    to,
    "You're in — finish setting up your Restroom Archive account",
    template(`
      <p style="text-align:center;font-size:20px;font-weight:400;color:#000;margin:40px 0 20px">
        Your beta-archivist application was approved
      </p>
      <hr style="border:solid 0.5px #000;width:90%" />
      <p style="text-align:center;padding:0 20px;font-size:14px;color:#000;margin:20px 0 30px">
        Welcome aboard. Click below to choose a username and password and finish setting up your account. This link expires in 7 days.
      </p>
      <p style="text-align:center;margin:20px 20px 30px">
        <a href="${link}" style="color:#fff;background-color:#000;font-size:14px;padding:8px 16px;text-decoration:none;border-radius:3px">
          Finish Setting Up My Account
        </a>
      </p>
    `),
  )
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await send(
    to,
    'Reset your Restroom Archive password',
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
  )
}
