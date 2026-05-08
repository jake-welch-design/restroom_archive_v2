const FROM = { email: 'noreply@restroomarchive.com', name: 'The Restroom Archive' }

function siteUrl() {
  return useRuntimeConfig().public.siteUrl || 'https://restroomarchive.com'
}

async function send(to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
      personalizations: [{ to: [{ email: to }] }],
    }),
  })

  if (!res.ok && res.status !== 202) {
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
    `Verify your Restroom Archive account\n\nClick the link below to verify your email. Expires in 24 hours.\n\n${link}\n\nIf you didn't create this account, ignore this email.`,
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
    `Reset your Restroom Archive password\n\nClick the link below to set a new password. Expires in 1 hour.\n\n${link}\n\nIf you didn't request this, ignore this email.`,
  )
}
