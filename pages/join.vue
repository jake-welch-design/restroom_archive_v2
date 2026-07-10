<script setup lang="ts">
const route = useRoute()
const { refreshSession } = useAuth()
const token = computed(() => (route.query.token as string | undefined) ?? '')

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// Validate the invite up front so we can greet the applicant by email and fail
// fast on a bad/expired/used link.
const { data: invite, error: inviteError, pending } = await useAsyncData(
  'beta-invite',
  () => token.value
    ? $fetch<{ email: string }>('/api/beta/invite', { query: { token: token.value } })
    : Promise.resolve(null),
)

const inviteMessage = computed(() => {
  const err = inviteError.value as { data?: { statusMessage?: string } } | null
  return err?.data?.statusMessage ?? 'This invite link is invalid or has already been used.'
})

async function submit() {
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/beta/claim', {
      method: 'POST',
      body: { token: token.value, username: username.value, password: password.value },
    })
    await refreshSession()
    await navigateTo('/account')
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err.data?.statusMessage ?? err.message ?? 'Could not create your account.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <CatalogHeader />
    <div class="auth-content">
      <h1 class="auth-title">Finish setting up your account</h1>

      <div v-if="!token || inviteError" class="auth-msg">
        <p class="form-error">{{ !token ? 'No invite token found in this link.' : inviteMessage }}</p>
        <NuxtLink to="/account" class="link-btn">Request access</NuxtLink>
      </div>

      <div v-else-if="pending" class="auth-msg">
        <p class="dim">Checking your invite…</p>
      </div>

      <form v-else class="form" @submit.prevent="submit">
        <p class="auth-intro">
          Welcome, beta-archivist! Your application for <strong>{{ invite?.email }}</strong> was approved.
          Choose a username and password to finish creating your account.
        </p>

        <label class="field">
          <span class="field-label">Username</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            required
            minlength="3"
            maxlength="20"
            class="field-input"
          />
          <span class="field-hint">3–20 characters: lowercase letters, numbers, underscores.</span>
        </label>

        <label class="field">
          <span class="field-label">Password</span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            class="field-input"
          />
          <span class="field-hint">Minimum 8 characters.</span>
        </label>

        <p v-if="error" class="form-error">{{ error }}</p>

        <button type="submit" class="primary-btn" :disabled="loading">
          {{ loading ? 'Creating account…' : 'Create my account' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  color: #000;
  overflow: hidden;
}
.auth-content {
  padding: 24px;
  overflow-y: auto;
  flex: 1 1 auto;
}
.auth-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 400;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}
.auth-intro {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.auth-msg p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 14px;
  color: #666;
}
.field-input {
  border: 1px solid #000;
  padding: 4px 2px;
  font: inherit;
  font-size: 14px;
  background: transparent;
  outline: none;
  color: #000;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: #999;
}
.form-error {
  margin: 0;
  font-size: 14px;
  color: #c33;
}
.primary-btn {
  background: #000;
  color: #fff;
  border: 0;
  padding: 10px 24px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  align-self: flex-start;
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary-btn:hover:not(:disabled) {
  background: #333;
}
.link-btn {
  background: transparent;
  border: 0;
  padding: 6px 10px 6px 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}
.dim {
  color: #999;
}

@media (max-width: 750px) {
  .auth-page {
    font-size: 12px;
  }
  .auth-content {
    padding: 12px;
  }
  .auth-title {
    font-size: 14px;
  }
  .field-input {
    font-size: 12px;
  }
  .primary-btn {
    font-size: 14px;
    padding: 8px 18px;
  }
}
</style>
