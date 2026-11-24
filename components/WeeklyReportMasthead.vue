<script setup lang="ts">
/**
 * The Weekly Report's masthead, as the emails open with it
 * (shared/utils/weeklyReport.ts): the logo beside the archive's name in bold
 * and "Weekly Report" under it. Used by the sign-up pop-up and the
 * confirmation page, so every Weekly Report screen starts the same way.
 *
 * The logo's alt is empty because the name sits right beside it in text.
 */
</script>

<template>
  <div class="wr-masthead">
    <img
      src="/newsletter/logo.png"
      width="56"
      height="56"
      alt=""
      class="wr-masthead-logo"
    />
    <div class="wr-masthead-text">
      <div class="wr-masthead-name">The Restroom Archive</div>
      <div>Weekly Report</div>
    </div>
  </div>
</template>

<style scoped>
/* The email's lockup: 56px logo, 16px gap, name at 140% over 130%. */
.wr-masthead {
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 1.3;
  color: var(--ink);
}

.wr-masthead-logo {
  display: block;
  flex: 0 0 auto;
}

.wr-masthead-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wr-masthead-name {
  font-weight: 700;
  line-height: 1.4;
}
</style>
