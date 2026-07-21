<script setup lang="ts">
const emit = defineEmits<{ submitted: [] }>();

const { isAdmin } = useAuth();
const { data: descriptorSuggestions } = useDescriptorSuggestions();
const { previewModelUrl } = useSubmissionPreview();
const { select } = useSelection();

const currentStep = ref(1);
const steps = [
  { n: 1, label: "Scan" },
  { n: 2, label: "Details" },
  { n: 3, label: "Description" },
  { n: 4, label: "Review" },
];

const uploadName = ref("");
const uploadLocation = ref("");
const uploadDate = ref("");
const uploadLat = ref("");
const uploadLng = ref("");
const uploadDescription = ref("");
const uploadDescriptors = ref<string[]>([]);
const uploadFile = ref<File | null>(null);
const uploadError = ref("");
const uploadLoading = ref(false);
const uploadSuccess = ref(false);

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  uploadFile.value = file;
  if (previewModelUrl.value) URL.revokeObjectURL(previewModelUrl.value);
  previewModelUrl.value = file ? URL.createObjectURL(file) : null;
}

// Native "leave site?" prompt for tab close/refresh while a scan is loaded —
// in-app navigation (route change, account tab switch) is guarded separately.
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!previewModelUrl.value) return;
  e.preventDefault();
  e.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  if (previewModelUrl.value) URL.revokeObjectURL(previewModelUrl.value);
  previewModelUrl.value = null;
});

const step1Valid = computed(() => !!uploadFile.value);

// Trailing ", XX" region code — matches "Salt Lake City, UT" and "Amsterdam, NL"
const locationFormatValid = computed(() =>
  /^.+,\s*[A-Za-z]{2}$/.test(uploadLocation.value.trim()),
);

const step2Valid = computed(() => {
  if (!uploadName.value.trim()) return false;
  if (!locationFormatValid.value) return false;
  if (!uploadDate.value) return false;
  const lat = parseFloat(uploadLat.value);
  const lng = parseFloat(uploadLng.value);
  if (uploadLat.value === "" || Number.isNaN(lat) || lat < -90 || lat > 90)
    return false;
  if (uploadLng.value === "" || Number.isNaN(lng) || lng < -180 || lng > 180)
    return false;
  return true;
});

function canAccessStep(n: number) {
  if (n <= 1) return true;
  if (n === 2) return step1Valid.value;
  return step1Valid.value && step2Valid.value;
}

function goNext() {
  if (currentStep.value === 1 && !step1Valid.value) return;
  if (currentStep.value === 2 && !step2Valid.value) return;
  currentStep.value = Math.min(4, currentStep.value + 1);
}
function goBack() {
  currentStep.value = Math.max(1, currentStep.value - 1);
}
function goToStep(n: number) {
  if (canAccessStep(n)) currentStep.value = n;
}

// Splits a Google Maps "lat, lng" clipboard paste (from right-click > copy
// coordinates) directly into both fields.
function onCoordsPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text") ?? "";
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return;
  e.preventDefault();
  uploadLat.value = match[1];
  uploadLng.value = match[2];
}

const googleMapsUrl = computed(() => {
  const query = [uploadName.value.trim(), uploadLocation.value.trim()]
    .filter(Boolean)
    .join(" ");
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
});

async function submitUpload() {
  if (!uploadFile.value) {
    uploadError.value = "Please select a .glb file.";
    return;
  }
  uploadError.value = "";
  uploadLoading.value = true;
  try {
    const fd = new FormData();
    fd.append("file", uploadFile.value);
    fd.append("name", uploadName.value);
    fd.append("location", uploadLocation.value);
    fd.append("isoDate", uploadDate.value);
    if (uploadLat.value) fd.append("lat", uploadLat.value);
    if (uploadLng.value) fd.append("lng", uploadLng.value);
    if (uploadDescription.value)
      fd.append("description", uploadDescription.value);
    if (uploadDescriptors.value.length)
      fd.append("descriptors", JSON.stringify(uploadDescriptors.value));

    const res = await $fetch<{ ok: boolean; slug: string }>(
      "/api/restrooms/submit",
      { method: "POST", body: fd },
    );
    uploadSuccess.value = true;
    emit("submitted");
    // Hand the now-published scan to the global viewer where the preview was,
    // then release the override so the panel toggle reappears.
    await refreshNuxtData("restrooms");
    select(res.slug);
    if (previewModelUrl.value) URL.revokeObjectURL(previewModelUrl.value);
    previewModelUrl.value = null;
    if (isAdmin.value) setTimeout(() => resetUpload(), 2000);
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string };
    uploadError.value =
      err.data?.statusMessage ?? err.message ?? "Upload failed.";
  } finally {
    uploadLoading.value = false;
  }
}

function resetUpload() {
  uploadName.value = "";
  uploadLocation.value = "";
  uploadDate.value = "";
  uploadLat.value = "";
  uploadLng.value = "";
  uploadDescription.value = "";
  uploadDescriptors.value = [];
  uploadFile.value = null;
  if (previewModelUrl.value) URL.revokeObjectURL(previewModelUrl.value);
  previewModelUrl.value = null;
  uploadError.value = "";
  uploadSuccess.value = false;
  currentStep.value = 1;
}
</script>

<template>
  <div class="submit-wizard">
    <div v-if="uploadSuccess" class="success-message">
      <p>{{ isAdmin ? "Published." : "Submitted — awaiting approval." }}</p>
      <button type="button" class="link-btn" @click="resetUpload">
        Submit another
      </button>
    </div>

    <div v-else class="wizard">
      <div class="step-tabs" role="tablist">
        <button
          v-for="s in steps"
          :key="s.n"
          type="button"
          role="tab"
          class="step-tab"
          :class="{ active: currentStep === s.n }"
          :aria-selected="currentStep === s.n"
          :disabled="!canAccessStep(s.n)"
          @click="goToStep(s.n)"
        >
          <span class="step-num">{{ s.n }}</span> {{ s.label }}
        </button>
      </div>

      <!-- Step 1: Scan -->
      <div v-if="currentStep === 1" class="form">
        <label class="field">
          <span class="field-label">GLB file <span class="req">*</span></span>
          <input
            type="file"
            accept=".glb"
            class="field-input"
            @change="onFileChange"
          />
        </label>
        <p v-if="uploadFile" class="field-hint">
          {{ uploadFile?.name }} selected — see the preview on the right.
        </p>

        <div class="step-actions">
          <button
            type="button"
            class="primary-btn step-next"
            :disabled="!step1Valid"
            @click="goNext"
          >
            Next
          </button>
        </div>
      </div>

      <!-- Step 2: Details -->
      <div v-else-if="currentStep === 2" class="form">
        <label class="field">
          <span class="field-label-row">
            <span class="field-label">Name <span class="req">*</span></span>
            <InfoTooltip>The name of the establishment</InfoTooltip>
          </span>
          <input v-model="uploadName" type="text" class="field-input" />
        </label>

        <label class="field">
          <span class="field-label-row">
            <span class="field-label"
              >Location <span class="req">*</span></span
            >
            <InfoTooltip>
              <p>City, State (U.S.) or</p>
              <p>City, Country (non-U.S.)</p>
            </InfoTooltip>
          </span>
          <input
            v-model="uploadLocation"
            type="text"
            placeholder="City, State"
            class="field-input"
          />
          <p
            v-if="uploadLocation && !locationFormatValid"
            class="field-hint field-hint-warn"
          >
            Use the format "City, ST" or "City, CC" — e.g. "Salt Lake City,
            UT" or "Amsterdam, NL".
          </p>
        </label>

        <div class="field">
          <span class="field-label-row">
            <span class="field-label"
              >Latitude, Longitude <span class="req">*</span></span
            >
            <InfoTooltip>
              Please be as accurate as you can. Right click the location on
              Google Maps to copy/paste the exact coordinates.
            </InfoTooltip>
            <a
              v-if="googleMapsUrl"
              :href="googleMapsUrl"
              target="_blank"
              rel="noopener"
              class="maps-link"
            >
              Open in Google Maps
            </a>
          </span>
          <div class="field-row">
            <label class="field">
              <span class="field-label">Latitude</span>
              <input
                v-model="uploadLat"
                type="number"
                step="any"
                min="-90"
                max="90"
                class="field-input"
                @paste="onCoordsPaste"
              />
            </label>
            <label class="field">
              <span class="field-label">Longitude</span>
              <input
                v-model="uploadLng"
                type="number"
                step="any"
                min="-180"
                max="180"
                class="field-input"
                @paste="onCoordsPaste"
              />
            </label>
          </div>
        </div>

        <label class="field">
          <span class="field-label">Date <span class="req">*</span></span>
          <input v-model="uploadDate" type="date" class="field-input" />
        </label>

        <div class="step-actions">
          <button type="button" class="link-btn" @click="goBack">Back</button>
          <button
            type="button"
            class="primary-btn step-next"
            :disabled="!step2Valid"
            @click="goNext"
          >
            Next
          </button>
        </div>
      </div>

      <!-- Step 3: Description -->
      <div v-else-if="currentStep === 3" class="form">
        <label class="field">
          <span class="field-label-row">
            <span class="field-label">Description</span>
            <InfoTooltip>
              <p>A good description tells us:</p>
              <ul>
                <li>
                  How does someone find this restroom inside the
                  establishment?
                </li>
                <li>
                  What are the primary amenities of this restroom and where
                  are they placed relative to each other in the space?
                </li>
                <li>What are the decorative characteristics?</li>
                <li>How does the space feel?</li>
                <li>
                  Are there any notable aspects of the restroom that you
                  would like visitors to pay attention to?
                </li>
              </ul>
            </InfoTooltip>
          </span>
          <textarea
            v-model="uploadDescription"
            class="field-input field-textarea"
            maxlength="1000"
            rows="6"
          />
          <span class="char-count">{{ uploadDescription.length }}/1000</span>
        </label>

        <div class="field">
          <span class="field-label-row">
            <span class="field-label">Descriptors</span>
            <InfoTooltip>
              <p>Choose tags that describe:</p>
              <ul>
                <li>Setting / Context</li>
                <li>Condition / Maintenance</li>
                <li>Spatial Quality</li>
                <li>Atmosphere</li>
                <li>Decor</li>
                <li>Unique continuities to other restrooms</li>
              </ul>
              <p>Does it deserve the accessible tag?</p>
              <ul>
                <li>Spacious enough for a wheelchair</li>
                <li>Grab bars</li>
                <li>Knee clearance under sink</li>
                <li>Lever, push, or sensor faucet on sink (no knobs)</li>
                <li>Lever door handle (no knobs)</li>
                <li>Amenities are at an accessible height and easy to reach</li>
              </ul>
            </InfoTooltip>
          </span>
          <TagInput
            v-model="uploadDescriptors"
            :suggestions="descriptorSuggestions ?? []"
          />
        </div>

        <div class="step-actions">
          <button type="button" class="link-btn" @click="goBack">Back</button>
          <button type="button" class="primary-btn step-next" @click="goNext">
            Next
          </button>
        </div>
      </div>

      <!-- Step 4: Review -->
      <div v-else class="form">
        <div class="review">
          <div class="review-row">
            <span class="review-label">Name</span>
            <span>{{ uploadName }}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Location</span>
            <span>{{ uploadLocation }}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Coordinates</span>
            <span>{{ uploadLat }}, {{ uploadLng }}</span>
          </div>
          <div class="review-row">
            <span class="review-label">Date</span>
            <span>{{ uploadDate }}</span>
          </div>
          <div v-if="uploadDescription" class="review-row">
            <span class="review-label">Description</span>
            <span>{{ uploadDescription }}</span>
          </div>
          <div v-if="uploadDescriptors.length" class="review-row">
            <span class="review-label">Descriptors</span>
            <span class="review-tags">
              <span
                v-for="t in uploadDescriptors"
                :key="t"
                class="review-tag"
                >{{ t }}</span
              >
            </span>
          </div>
        </div>

        <p v-if="uploadError" class="form-error">{{ uploadError }}</p>

        <div class="step-actions">
          <button type="button" class="link-btn" @click="goBack">Back</button>
          <button
            type="button"
            class="primary-btn step-next"
            :disabled="uploadLoading"
            @click="submitUpload"
          >
            {{
              uploadLoading
                ? "Uploading…"
                : isAdmin
                  ? "Submit"
                  : "Submit for review"
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.success-message {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-btn {
  background: transparent;
  border: 0;
  padding: 6px 10px;
  font: inherit;
  font-size: 14px;
  color: #000;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;
}

.wizard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 420px;
}

/* Step tabs */
.step-tabs {
  display: flex;
  border: 1px solid #000;
}
.step-tab {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  border: 0;
  border-right: 1px solid #000;
  padding: 8px 4px;
  font: inherit;
  font-size: 13px;
  color: #666;
  cursor: pointer;
}
.step-tab:last-child {
  border-right: 0;
}
.step-tab:hover:not(.active):not(:disabled) {
  background: #f4f4f4;
  color: #000;
}
.step-tab.active {
  background: #000;
  color: #fff;
}
.step-tab:disabled {
  color: #ccc;
  cursor: not-allowed;
}
.step-num {
  font-weight: 700;
}

/* Shared form */
.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.field-label {
  font-size: 14px;
  color: #666;
}
.req {
  color: #000;
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
.field-textarea {
  resize: vertical;
  padding: 6px;
}
.char-count {
  font-size: 12px;
  color: #999;
  text-align: right;
}
.field-hint {
  margin: 0;
  font-size: 12px;
  color: #999;
}
.field-hint-warn {
  color: #c33;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.maps-link {
  margin-left: auto;
  font-size: 12px;
  color: #000;
  white-space: nowrap;
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
}
.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary-btn:hover:not(:disabled) {
  background: #333;
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 4px;
}
.step-next {
  margin-left: auto;
}

/* Review step */
.review {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.review-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
}
.review-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.review-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.review-tag {
  background: #000;
  color: #fff;
  font-size: 12px;
  padding: 3px 7px;
}

@media (max-width: 750px) {
  .field-input {
    font-size: 16px; /* keep 16px — iOS zooms into inputs below 16px */
  }
  .primary-btn {
    font-size: 12px;
  }
}
</style>
