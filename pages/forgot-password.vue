<script setup lang="ts">
const email = ref('')
const turnstileToken = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

async function submit() {
  if (!turnstileToken.value) {
    for (let i = 0; i < 20 && !turnstileToken.value; i++) {
      await new Promise(r => setTimeout(r, 100))
    }
    if (!turnstileToken.value) {
      error.value = 'Still verifying — please wait a moment and try again.'
      return
    }
  }
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value, turnstileToken: turnstileToken.value },
    })
    submitted.value = true
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err.data?.statusMessage ?? err.message ?? 'Something went wrong.'
    turnstileToken.value = ''
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
      <h1 class="auth-title">Forgot your password?</h1>

      <div v-if="submitted" class="auth-msg">
        <p>If an account exists for that email, we've sent a reset link.</p>
        <p class="dim">Check your inbox — the link expires in 1 hour.</p>
        <NuxtLink to="/account" class="link-btn">Back to sign in</NuxtLink>
      </div>

      <form v-else class="form" @submit.prevent="submit">
        <p class="auth-intro">Enter the email you signed up with. We'll send a link to reset your password.</p>

        <label class="field">
          <span class="field-label">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="field-input"
          />
        </label>

        <NuxtTurnstile
          v-model="turnstileToken"
          class="turnstile"
          :options="{ theme: 'light', appearance: 'interaction-only' }"
        />

        <p v-if="error" class="form-error">{{ error }}</p>

        <button type="submit" class="primary-btn" :disabled="loading || !turnstileToken">
          {{ loading ? 'Sending…' : !turnstileToken ? 'Verifying…' : 'Send reset link' }}
        </button>

        <NuxtLink to="/account" class="link-btn">Back to sign in</NuxtLink>
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
.turnstile {
  margin: 4px 0;
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
