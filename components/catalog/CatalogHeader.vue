<script setup lang="ts">
const route = useRoute();
const { loggedIn } = useAuth();
const isHome = computed(() => route.path === "/");
const menuOpen = ref(false);

watch(
  () => route.path,
  () => {
    menuOpen.value = false;
  },
);
</script>

<template>
  <header class="catalog-head">
    <div class="head-row">
      <component :is="isHome ? 'h1' : 'p'" class="site-title">
        <a href="/" style="text-decoration: none; color: inherit"
          >The Restroom Archive</a
        >
      </component>
      <nav class="top-nav">
        <NuxtLink to="/about" :class="{ active: route.path === '/about' }"
          >Info</NuxtLink
        >
        <NuxtLink
          to="/"
          :class="{
            active: route.path === '/' || route.path.startsWith('/r/'),
          }"
          >Catalog</NuxtLink
        >
        <NuxtLink
          to="/account"
          :class="{ active: route.path === '/account' }"
          >{{ loggedIn ? "Account" : "Login" }}</NuxtLink
        >
      </nav>
      <button
        type="button"
        class="menu-toggle"
        :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        {{ menuOpen ? "✕" : "Menu" }}
      </button>
    </div>

    <div class="mobile-nav-wrap" :class="{ open: menuOpen }">
      <nav class="mobile-nav">
        <NuxtLink to="/about" :class="{ active: route.path === '/about' }"
          >Info</NuxtLink
        >
        <NuxtLink
          to="/"
          :class="{
            active: route.path === '/' || route.path.startsWith('/r/'),
          }"
          >Catalog</NuxtLink
        >
        <NuxtLink
          to="/account"
          :class="{ active: route.path === '/account' }"
          >{{ loggedIn ? "Account" : "Login" }}</NuxtLink
        >
      </nav>
    </div>
  </header>
</template>

<style scoped>
.catalog-head {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #000;
  flex: 0 0 auto;
  font-family: Arial, Helvetica, sans-serif;
  /* Pinned, not inherited: the header has to be the same height on every page,
     and pages set their own line-height on the root (Account's 1.4 made this
     ~6px taller than on Catalog, dropping the whole head-row out of line). */
  line-height: normal;
  background: #fff;
}

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
}

.site-title {
  margin: 0;
  font-size: 24px;
  font-weight: 400;
  color: #000;
}

.top-nav {
  display: flex;
  gap: 20px;
  font-size: 14px;
}

.top-nav a {
  color: #000;
  text-decoration: none;
}

.top-nav a.active {
  color: #595959;
}

/* Matches the account tabs' hover (color tint, no underline); pointer
   devices only so a tap doesn't leave the tint stuck on. */
@media (hover: hover) {
  .top-nav a:hover {
    color: #595959;
  }
}

/* Menu toggle — hidden on desktop */
.menu-toggle {
  display: none;
  align-items: center;
  justify-content: flex-end;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  /* Fixed width so the row doesn't shift when the label swaps to the ✕. */
  min-width: 44px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  color: #000;
}

/* Same hover treatment as the nav links; pointer devices only. */
@media (hover: hover) {
  .menu-toggle:hover {
    color: #595959;
  }
}

/* Mobile nav drawer — hidden on desktop */
.mobile-nav-wrap {
  display: none;
}

@media (max-width: 750px) {
  .head-row {
    padding: 8px;
  }

  .top-nav {
    display: none;
  }

  .menu-toggle {
    display: flex;
  }

  .mobile-nav-wrap {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.25s ease;
  }

  .mobile-nav-wrap.open {
    grid-template-rows: 1fr;
  }

  .mobile-nav {
    overflow: hidden;
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    padding: 0 8px;
    font-size: 14px;
    transition: padding 0.25s ease;
  }

  .mobile-nav-wrap.open .mobile-nav {
    padding: 0 8px 8px 8px;
  }

  .mobile-nav a {
    color: #000;
    text-decoration: none;
  }

  .mobile-nav a.active {
    color: #595959;
  }

  /* Reached with a mouse only in a narrow desktop window — on a phone
     `hover: hover` is false and this never applies. */
  @media (hover: hover) {
    .mobile-nav a:hover {
      color: #595959;
    }
  }
}
</style>
