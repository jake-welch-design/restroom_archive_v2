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
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    errorMessage.value = err.data?.statusMessage ?? 'Verification failed.'
    status.value = 'error'
  }
}

onMounted(verify)
</script>

<template>
  <div class="verify-page">
    <div class="verify-box">
      <p v-if="status === 'loading'" class="verify-msg dim">Verifying your email…</p>
      <div v-else-if="status === 'success'" class="verify-msg">
        <p class="verify-ok">Email verified.</p>
        <p class="dim">Your account is now fully active.</p>
        <NuxtLink to="/account" class="verify-link">Go to your account</NuxtLink>
      </div>
      <div v-else-if="status === 'error'" class="verify-msg">
        <p class="verify-err">{{ errorMessage }}</p>
        <p class="dim">
          You can request a new link from your
          <NuxtLink to="/account" class="verify-link">account page</NuxtLink>.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.verify-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: 32px 16px;
}
.verify-box {
  max-width: 420px;
  width: 100%;
  text-align: center;
}
.verify-msg {
  font-size: 15px;
  line-height: 1.6;
}
.verify-ok {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}
.verify-err {
  color: #c33;
  margin-bottom: 12px;
}
.dim {
  color: #888;
  font-size: 13px;
}
.verify-link {
  color: inherit;
  text-decoration: underline;
}
</style>
