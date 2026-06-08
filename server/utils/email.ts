const FROM_EMAIL = 'noreply@restroomarchive.com'
const FROM_NAME = 'The Restroom Archive'

function siteUrl() {
  return useRuntimeConfig().public.siteUrl || 'https://restroomarchive.com'
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

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${siteUrl()}/verify-email?token=${encodeURIComponent(token)}`
  await send(
    to,
    'Verify your Restroom Archive account',
    `<p>Thanks for creating an account on <strong>The Restroom Archive</strong>.</p>
<p>Click the link below to verify your email address. The link expires in 24 hours.</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#999;font-size:12px">If you didn't create this account, you can ignore this email.</p>`,
  )
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await send(
    to,
    'Reset your Restroom Archive password',
    `<p>We received a request to reset the password for your <strong>The Restroom Archive</strong> account.</p>
<p>Click the link below to set a new password. The link expires in 1 hour.</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#999;font-size:12px">If you didn't request this, ignore this email — your password won't change.</p>`,
  )
}
