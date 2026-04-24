<script setup lang="ts">
const { user, loggedIn, approved, isAdmin, refreshSession, signout } = useAuth()

// -------------- Auth form (logged-out) --------------
const authTab = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')
const displayName = ref('')
const turnstileToken = ref('')
const authError = ref('')
const authLoading = ref(false)

async function submitAuth() {
  if (!turnstileToken.value) {
    authError.value = 'Please complete the verification challenge.'
    return
  }
  authError.value = ''
  authLoading.value = true
  try {
    const endpoint = authTab.value === 'signin' ? '/api/auth/signin' : '/api/auth/signup'
    const body: Record<string, string> = {
      email: email.value,
      password: password.value,
      turnstileToken: turnstileToken.value,
    }
    if (authTab.value === 'signup' && displayName.value) {
      body.displayName = displayName.value
    }
    await $fetch(endpoint, { method: 'POST', body })
    await refreshSession()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    authError.value = err.data?.statusMessage ?? err.message ?? 'Something went wrong.'
    turnstileToken.value = ''
  }
  finally {
    authLoading.value = false
  }
}

function switchTab(tab: 'signin' | 'signup') {
  authTab.value = tab
  authError.value = ''
  turnstileToken.value = ''
}

// -------------- Submit form --------------
const uploadName = ref('')
const uploadLocation = ref('')
const uploadDate = ref('')
const uploadLat = ref('')
const uploadLng = ref('')
const uploadDescription = ref('')
const uploadDescriptors = ref<string[]>([])
const uploadFile = ref<File | null>(null)
const uploadError = ref('')
const uploadLoading = ref(false)
const uploadSuccess = ref(false)

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  uploadFile.value = input.files?.[0] ?? null
}

async function submitUpload() {
  if (!uploadFile.value) {
    uploadError.value = 'Please select a .glb file.'
    return
  }
  uploadError.value = ''
  uploadLoading.value = true
  try {
    const fd = new FormData()
    fd.append('file', uploadFile.value)
    fd.append('name', uploadName.value)
    fd.append('location', uploadLocation.value)
    fd.append('isoDate', uploadDate.value)
    if (uploadLat.value) fd.append('lat', uploadLat.value)
    if (uploadLng.value) fd.append('lng', uploadLng.value)
    if (uploadDescription.value) fd.append('description', uploadDescription.value)
    if (uploadDescriptors.value.length) fd.append('descriptors', JSON.stringify(uploadDescriptors.value))

    await $fetch('/api/restrooms/submit', { method: 'POST', body: fd })
    uploadSuccess.value = true
    if (isAdmin.value) {
      await Promise.all([refreshRestroomQueue(), refreshNuxtData('restrooms')])
      setTimeout(() => resetUpload(), 2000)
    }
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    uploadError.value = err.data?.statusMessage ?? err.message ?? 'Upload failed.'
  }
  finally {
    uploadLoading.value = false
  }
}

function resetUpload() {
  uploadName.value = ''
  uploadLocation.value = ''
  uploadDate.value = ''
  uploadLat.value = ''
  uploadLng.value = ''
  uploadDescription.value = ''
  uploadDescriptors.value = []
  uploadFile.value = null
  uploadError.value = ''
  uploadSuccess.value = false
}

// -------------- Admin queues --------------
type PendingRestroom = {
  id: number
  slug: string
  name: string
  location: string
  date: string
  isoDate: string
  lat: number | null
  lng: number | null
  description: string | null
  descriptors: string[]
  modelUrl: string
  createdAt: string
  submitter: { email: string; displayName: string | null } | null
}

type PendingUser = {
  id: number
  email: string
  displayName: string | null
  createdAt: string
}

type RemovalRequest = {
  id: number
  slug: string
  name: string
  location: string
  date: string
  status: string
  removalReason: string | null
  requester: { email: string; displayName: string | null } | null
}

const { data: pendingRestrooms, refresh: refreshRestroomQueue } = await useFetch<PendingRestroom[]>('/api/admin/restrooms', {
  server: false,
  immediate: false,
  default: () => [],
})

const { data: pendingUsers, refresh: refreshUserQueue } = await useFetch<PendingUser[]>('/api/admin/users/pending', {
  server: false,
  immediate: false,
  default: () => [],
})

const { data: removalRequests, refresh: refreshRemovalQueue } = await useFetch<RemovalRequest[]>('/api/admin/restrooms/removals', {
  server: false,
  immediate: false,
  default: () => [],
})

watch(isAdmin, async (v) => {
  if (v) {
    await Promise.all([refreshRestroomQueue(), refreshUserQueue(), refreshRemovalQueue()])
  }
}, { immediate: true })

const actionLoading = ref<string | null>(null)
const actionError = ref('')

async function runAction(key: string, url: string, after: () => Promise<void>) {
  actionLoading.value = key
  actionError.value = ''
  try {
    await $fetch(url, { method: 'POST' })
    await after()
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    actionError.value = err.data?.statusMessage ?? 'Action failed.'
  }
  finally {
    actionLoading.value = null
  }
}

const publishRestroom = (id: number) => runAction(`r-publish-${id}`, `/api/admin/restrooms/${id}/publish`, async () => { await refreshRestroomQueue(); await refreshNuxtData('restrooms') })
const rejectRestroom = (id: number) => runAction(`r-reject-${id}`, `/api/admin/restrooms/${id}/reject`, refreshRestroomQueue)
const approveUser = (id: number) => runAction(`u-approve-${id}`, `/api/admin/users/${id}/approve`, refreshUserQueue)
const rejectUser = (id: number) => runAction(`u-reject-${id}`, `/api/admin/users/${id}/reject`, refreshUserQueue)
const removeRestroom = (id: number) => runAction(`rm-reject-${id}`, `/api/admin/restrooms/${id}/reject`, refreshRemovalQueue)
const dismissRemoval = (id: number) => runAction(`rm-dismiss-${id}`, `/api/admin/restrooms/${id}/dismiss-removal`, refreshRemovalQueue)

const roleLabel = computed(() => {
  if (!user.value) return ''
  if (isAdmin.value) return 'Admin'
  return approved.value ? 'Archivist' : 'Archivist · awaiting approval'
})
</script>

<template>
  <div class="account-page">
    <DirectoryHeader />

    <!-- Logged-out: auth forms -->
    <div v-if="!loggedIn" class="body-section">
      <div class="auth-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'signin' }"
          @click="switchTab('signin')"
        >Sign in</button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: authTab === 'signup' }"
          @click="switchTab('signup')"
        >Create account</button>
      </div>

      <form class="form" @submit.prevent="submitAuth">
        <label class="field">
          <span class="field-label">Email</span>
          <input v-model="email" type="email" required autocomplete="email" class="field-input" />
        </label>

        <label v-if="authTab === 'signup'" class="field">
          <span class="field-label">Display name</span>
          <input v-model="displayName" type="text" autocomplete="name" class="field-input" />
        </label>

        <label class="field">
          <span class="field-label">Password</span>
          <input
            v-model="password"
            type="password"
            required
            :autocomplete="authTab === 'signup' ? 'new-password' : 'current-password'"
            class="field-input"
          />
        </label>
        <p v-if="authTab === 'signup'" class="field-hint">Minimum 8 characters. New accounts require admin approval before submitting or annotating.</p>

        <NuxtTurnstile v-model="turnstileToken" class="turnstile" />

        <p v-if="authError" class="form-error">{{ authError }}</p>

        <button type="submit" class="primary-btn" :disabled="authLoading">
          {{ authLoading ? '…' : authTab === 'signin' ? 'Sign in' : 'Create account' }}
        </button>
      </form>
    </div>

    <!-- Logged-in -->
    <div v-else class="body-section">
      <header class="account-header">
        <span class="account-email">{{ user?.email ?? user?.displayName }}</span>
        <span class="account-role">{{ roleLabel }}</span>
      </header>

      <div class="header-actions">
        <button type="button" class="link-btn" @click="signout">Sign out</button>
      </div>

      <!-- Unapproved archivist -->
      <div v-if="!approved" class="awaiting">
        <p>A site admin will review and approve your account shortly. You'll be able to submit restrooms and leave annotations once approved.</p>
      </div>

      <!-- Approved: submit form -->
      <section v-else class="section">
        <h2 class="section-title">New submission</h2>
        <div v-if="uploadSuccess" class="success-message">
          <p>{{ isAdmin ? 'Published.' : 'Submitted — awaiting approval.' }}</p>
          <button type="button" class="link-btn" @click="resetUpload">Submit another</button>
        </div>
        <form v-else class="form" @submit.prevent="submitUpload">
          <label class="field">
            <span class="field-label">Name <span class="req">*</span></span>
            <input v-model="uploadName" type="text" required class="field-input" />
          </label>
          <label class="field">
            <span class="field-label">Location <span class="req">*</span></span>
            <input v-model="uploadLocation" type="text" required placeholder="City, State" class="field-input" />
          </label>
          <label class="field">
            <span class="field-label">Date <span class="req">*</span></span>
            <input v-model="uploadDate" type="date" required class="field-input" />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">Latitude</span>
              <input v-model="uploadLat" type="number" step="any" min="-90" max="90" class="field-input" />
            </label>
            <label class="field">
              <span class="field-label">Longitude</span>
              <input v-model="uploadLng" type="number" step="any" min="-180" max="180" class="field-input" />
            </label>
          </div>
          <label class="field">
            <span class="field-label">Description</span>
            <textarea v-model="uploadDescription" class="field-input field-textarea" maxlength="1000" rows="4" />
            <span class="char-count">{{ uploadDescription.length }}/1000</span>
          </label>
          <div class="field">
            <span class="field-label">Descriptors</span>
            <TagInput v-model="uploadDescriptors" />
          </div>
          <label class="field">
            <span class="field-label">GLB file <span class="req">*</span></span>
            <input type="file" accept=".glb" required class="field-input" @change="onFileChange" />
          </label>

          <p v-if="uploadError" class="form-error">{{ uploadError }}</p>

          <button type="submit" class="primary-btn" :disabled="uploadLoading">
            {{ uploadLoading ? 'Uploading…' : isAdmin ? 'Submit' : 'Submit for review' }}
          </button>
        </form>
      </section>

      <!-- Admin queues -->
      <template v-if="isAdmin">
        <p v-if="actionError" class="form-error action-error">{{ actionError }}</p>

        <section class="section">
          <h2 class="section-title">
            Pending submissions
            <span v-if="pendingRestrooms?.length" class="count">{{ pendingRestrooms.length }}</span>
          </h2>

          <div v-if="!pendingRestrooms?.length" class="empty">No submissions pending.</div>

          <div v-else class="queue">
            <div v-for="r in pendingRestrooms" :key="r.id" class="card">
              <div class="card-header">
                <span class="card-name">{{ r.name }}</span>
                <span class="card-meta">{{ r.date }} · {{ r.location }}</span>
              </div>
              <div class="card-body">
                <div class="preview-wrap">
                  <ClientOnly>
                    <Viewer :model-url="r.modelUrl" />
                  </ClientOnly>
                </div>
                <dl class="card-details">
                  <template v-if="r.lat != null && r.lng != null">
                    <dt>Coordinates</dt>
                    <dd>{{ r.lat.toFixed(4) }}, {{ r.lng.toFixed(4) }}</dd>
                  </template>
                  <template v-if="r.description">
                    <dt>Description</dt>
                    <dd class="dd-description">{{ r.description }}</dd>
                  </template>
                  <template v-if="r.descriptors?.length">
                    <dt>Descriptors</dt>
                    <dd>
                      <span v-for="t in r.descriptors" :key="t" class="admin-tag">{{ t }}</span>
                    </dd>
                  </template>
                  <dt>Submitted by</dt>
                  <dd>{{ r.submitter?.displayName ?? r.submitter?.email ?? 'Legacy entry' }}</dd>
                  <dt>Submitted at</dt>
                  <dd>{{ r.createdAt }}</dd>
                </dl>
              </div>
              <div class="card-actions">
                <button type="button" class="btn btn-publish" :disabled="actionLoading === `r-publish-${r.id}`" @click="publishRestroom(r.id)">
                  {{ actionLoading === `r-publish-${r.id}` ? '…' : 'Publish' }}
                </button>
                <button type="button" class="btn btn-reject" :disabled="actionLoading === `r-reject-${r.id}`" @click="rejectRestroom(r.id)">
                  {{ actionLoading === `r-reject-${r.id}` ? '…' : 'Reject' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">
            Pending accounts
            <span v-if="pendingUsers?.length" class="count">{{ pendingUsers.length }}</span>
          </h2>

          <div v-if="!pendingUsers?.length" class="empty">No accounts pending.</div>

          <ul v-else class="simple-list">
            <li v-for="u in pendingUsers" :key="u.id" class="simple-row">
              <div class="simple-main">
                <span class="simple-title">{{ u.displayName || u.email }}</span>
                <span class="simple-meta">{{ u.email }} · joined {{ u.createdAt }}</span>
              </div>
              <div class="simple-actions">
                <button type="button" class="btn btn-publish" :disabled="actionLoading === `u-approve-${u.id}`" @click="approveUser(u.id)">
                  {{ actionLoading === `u-approve-${u.id}` ? '…' : 'Approve' }}
                </button>
                <button type="button" class="btn btn-reject" :disabled="actionLoading === `u-reject-${u.id}`" @click="rejectUser(u.id)">
                  {{ actionLoading === `u-reject-${u.id}` ? '…' : 'Reject' }}
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="section">
          <h2 class="section-title">
            Removal requests
            <span v-if="removalRequests?.length" class="count">{{ removalRequests.length }}</span>
          </h2>

          <div v-if="!removalRequests?.length" class="empty">No removal requests.</div>

          <ul v-else class="simple-list">
            <li v-for="r in removalRequests" :key="r.id" class="simple-row">
              <div class="simple-main">
                <span class="simple-title">{{ r.name }}</span>
                <span class="simple-meta">{{ r.date }} · {{ r.location }} · status: {{ r.status }}</span>
                <span v-if="r.removalReason" class="simple-meta reason">Reason: {{ r.removalReason }}</span>
                <span class="simple-meta">
                  Requested by {{ r.requester?.displayName ?? r.requester?.email ?? 'unknown' }}
                </span>
              </div>
              <div class="simple-actions">
                <button type="button" class="btn btn-reject" :disabled="actionLoading === `rm-reject-${r.id}`" @click="removeRestroom(r.id)">
                  {{ actionLoading === `rm-reject-${r.id}` ? '…' : 'Remove' }}
                </button>
                <button type="button" class="btn" :disabled="actionLoading === `rm-dismiss-${r.id}`" @click="dismissRemoval(r.id)">
                  {{ actionLoading === `rm-dismiss-${r.id}` ? '…' : 'Dismiss' }}
                </button>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 16px;
  color: #000;
  overflow: hidden;
}
.body-section {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px;
}

/* Header */
.account-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid #000;
  padding-bottom: 8px;
  margin-bottom: 8px;
}
.account-email {
  font-size: 16px;
}
.account-role {
  font-size: 14px;
  color: #b3b3b3;
}
.header-actions {
  margin-bottom: 24px;
  display: flex;
  justify-content: flex-end;
}

.awaiting {
  background: #f4f4f4;
  padding: 16px;
  font-size: 14px;
  color: #000;
  margin-bottom: 24px;
}
.awaiting p {
  margin: 0;
}

/* Auth tabs */
.auth-tabs {
  display: flex;
  margin-bottom: 24px;
  border-bottom: 1px solid #000;
}
.tab-btn {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 8px 16px;
  font: inherit;
  font-size: 16px;
  cursor: pointer;
  color: #b3b3b3;
}
.tab-btn.active {
  color: #000;
  border-bottom-color: #000;
}

/* Shared form */
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
.req { color: #000; }
.field-input {
  border: 0;
  border-bottom: 1px solid #000;
  padding: 4px 0;
  font: inherit;
  font-size: 16px;
  background: transparent;
  outline: none;
  color: #000;
}
.field-textarea {
  resize: vertical;
  border: 1px solid #000;
  padding: 6px;
}
.char-count {
  font-size: 12px;
  color: #999;
  text-align: right;
}
.field-hint {
  margin: -8px 0 0;
  font-size: 12px;
  color: #999;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.turnstile { margin: 4px 0; }
.form-error {
  margin: 0;
  font-size: 14px;
  color: #c33;
}
.action-error { margin-bottom: 16px; }

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
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.primary-btn:hover:not(:disabled) { background: #333; }

.success-message {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-btn {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}

/* Admin sections */
.section {
  margin-top: 40px;
}
.section-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 400;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #000;
  padding-bottom: 4px;
}
.count {
  font-size: 12px;
  background: #000;
  color: #fff;
  border-radius: 999px;
  padding: 1px 8px;
}
.empty {
  color: #666;
  font-size: 14px;
}
.queue {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.card { border: 1px solid #000; }
.card-header {
  padding: 12px 16px;
  border-bottom: 1px solid #000;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-name { font-size: 16px; }
.card-meta { font-size: 13px; color: #666; }
.card-body {
  display: grid;
  grid-template-columns: 200px 1fr;
}
.preview-wrap {
  width: 200px;
  height: 200px;
  border-right: 1px solid #000;
  background: #000;
  overflow: hidden;
}
.card-details {
  margin: 0;
  padding: 12px 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  font-size: 14px;
  align-content: start;
}
dt { color: #666; white-space: nowrap; }
dd { margin: 0; word-break: break-word; }
.dd-description { white-space: pre-wrap; line-height: 1.4; }
.admin-tag {
  display: inline-block;
  background: #000;
  color: #fff;
  font-size: 12px;
  line-height: 1.2;
  padding: 2px 6px;
  margin-right: 4px;
  margin-bottom: 4px;
  border-radius: 0;
}
.card-actions {
  padding: 12px 16px;
  border-top: 1px solid #000;
  display: flex;
  gap: 12px;
}
.btn {
  background: transparent;
  border: 1px solid #000;
  padding: 6px 20px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-publish:hover:not(:disabled) { background: #000; color: #fff; }
.btn-reject:hover:not(:disabled) { background: #c33; border-color: #c33; color: #fff; }

.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid #000;
}
.simple-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #000;
}
.simple-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.simple-title { font-size: 15px; }
.simple-meta { font-size: 13px; color: #666; }
.simple-meta.reason { color: #000; }
.simple-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 750px) {
  .account-page {
    font-size: 12px;
  }
  .body-section {
    padding: 12px;
  }
  .tab-btn {
    font-size: 12px;
    padding: 8px 10px;
  }
  .field-input {
    font-size: 16px; /* keep 16px — iOS zooms into inputs below 16px */
  }
  .primary-btn {
    font-size: 12px;
  }
  .section-title {
    font-size: 14px;
  }
  .card-body {
    grid-template-columns: 1fr;
  }
  .preview-wrap {
    width: 100%;
    height: 160px;
    border-right: none;
    border-bottom: 1px solid #000;
  }
}
</style>
