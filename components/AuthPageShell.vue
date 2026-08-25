<script setup lang="ts">
/**
 * Chrome for the standalone password pages: forgot-password and reset-password.
 *
 * Both are single-purpose pages that live outside the account tabs, and both
 * previously carried an identical copy of this markup and roughly 180 lines of
 * identical style. What differs between them is only the heading and the body,
 * so those are the props and the slot.
 *
 * Sizing steps down with the panel rather than the window, on the same 560px
 * breakpoint the catalog and its header use. These pages render inside the
 * layout's catalog panel, so the panel's width is what determines whether the
 * text has room, not the viewport's.
 */
defineProps<{ title: string }>();
</script>

<template>
  <div class="auth-page">
    <CatalogHeader />
    <div class="auth-content thin-scroll">
      <h1 class="auth-title">{{ title }}</h1>
      <slot />
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

  /* These pages run a step larger than the account page, so the shared form
     tokens are retuned here rather than the rules being restated. */
  --field-label-size: 14px;
  --field-input-padding: 4px 2px;
  --primary-btn-padding: 10px 24px;
  --link-btn-padding: 6px 10px 6px 0;
  --form-gap: 16px;
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

/* Unscoped-adjacent concerns the slot content relies on: the form width and
   the prose blocks these pages put beside it. `:deep` because the elements are
   the page's, not this component's. */
.auth-content :deep(.form) {
  max-width: 380px;
}

.auth-content :deep(.auth-intro) {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.auth-content :deep(.auth-msg p) {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.5;
}

.auth-content :deep(.form-error),
.auth-content :deep(.field-label) {
  font-size: 14px;
}

/* Same panel-width step as the catalog and its header. */
@container panel (max-width: 560px) {
  .auth-page {
    font-size: 12px;
    --primary-btn-padding: 8px 18px;
  }
  .auth-content {
    padding: 12px;
  }
  .auth-title {
    font-size: 14px;
  }
}
</style>
