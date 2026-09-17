<script setup lang="ts">
/**
 * The Archivist Guide, whole: the button that opens it and the dialog it opens.
 *
 * Placed in an <AccountSubTabs> slot, where the `subtab-btn` class gives the
 * button the sub-tab look. The walkthrough itself, content included, lives in
 * AccountArchivistGuideDialog.
 */
const open = ref(false);
</script>

<template>
  <!-- The button is the root so the sub-tab row can style it as slotted
       content. The dialog is teleported out rather than nested in it: it opens
       in the top layer either way, and a <dialog> inside a <button> is not
       valid HTML. -->
  <button
    type="button"
    class="subtab-btn"
    aria-haspopup="dialog"
    @click="open = true"
  >
    Archivist Guide
    <span class="guide-icon" aria-hidden="true">?</span>
    <Teleport to="body">
      <AccountArchivistGuideDialog :open="open" @close="open = false" />
    </Teleport>
  </button>
</template>

<style scoped>
/* InfoTooltip's circle, in the colour of the button text around it. */
.guide-icon {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
}
</style>
