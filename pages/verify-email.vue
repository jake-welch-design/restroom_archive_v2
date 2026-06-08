<script setup lang="ts">
const route = useRoute()
const token = computed(() => route.query.token as string | undefined)

const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const errorMessage = ref('')

const { refreshSession } = useAuth()

async function verify() {
  if (!token.value) {
    status.value = 'error'
    errorMessage.value = 'No verification token found in this link.'
    return
  }
  status.value = 'loading'
  try {
    await $fetch('/api/auth/verify-email', {
      method: 'POST',
      body: { token: token.value },
    })
    await refreshSession()
    status.value = 'success'
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    errorMessage.value = err.data?.statusMessage ?? 'Verification failed.'
    status.value = 'error'
  }
}

onMounted(verify)
</script>

<template>
  <div class="auth-page">
    <CatalogHeader />
    <div class="auth-content">
      <h1 class="auth-title">Verify your email</h1>

      <p v-if="status === 'loading'" class="auth-msg dim">Verifying your email…</p>

      <div v-else-if="status === 'success'" class="auth-msg">
        <p>Email verified.</p>
        <p class="dim">Your account is now fully active.</p>
        <NuxtLink to="/account" class="link-btn">Go to your account</NuxtLink>
      </div>

      <div v-else-if="status === 'error'" class="auth-msg">
        <p class="form-error">{{ errorMessage }}</p>
        <p class="dim">
          You can request a new link from your
          <NuxtLink to="/account" class="inline-link">account page</NuxtLink>.
        </p>
      </div>
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
.auth-msg p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
}
.form-error {
  margin: 0 0 8px;
  font-size: 14px;
  color: #c33;
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
  display: inline-block;
}
.inline-link {
  color: #000;
  text-decoration: underline;
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
}
</style>
