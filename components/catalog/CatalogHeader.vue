<script setup lang="ts">
const route = useRoute();
const { loggedIn } = useAuth();
const isHome = computed(() => route.path === "/");
const menuOpen = ref(false);

watch(() => route.path, () => {
  menuOpen.value = false;
});
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
          >About</NuxtLink
        >
        <NuxtLink
          to="/"
          :class="{ active: route.path === '/' || route.path.startsWith('/r/') }"
          >Catalog</NuxtLink
        >
        <NuxtLink to="/account" :class="{ active: route.path === '/account' }">{{
          loggedIn ? "Account" : "Login"
        }}</NuxtLink>
      </nav>
      <button
        type="button"
        class="hamburger"
        :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span class="bar" :class="{ open: menuOpen }" />
        <span class="bar" :class="{ open: menuOpen }" />
        <span class="bar" :class="{ open: menuOpen }" />
      </button>
    </div>

    <div class="mobile-nav-wrap" :class="{ open: menuOpen }">
      <nav class="mobile-nav">
        <NuxtLink to="/about" :class="{ active: route.path === '/about' }"
          >About</NuxtLink
        >
        <NuxtLink
          to="/"
          :class="{ active: route.path === '/' || route.path.startsWith('/r/') }"
          >Catalog</NuxtLink
        >
        <NuxtLink to="/account" :class="{ active: route.path === '/account' }">{{
          loggedIn ? "Account" : "Login"
        }}</NuxtLink>
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
  font-size: 16px;
}

.top-nav a {
  color: #000;
  text-decoration: none;
}

.top-nav a.active {
  color: #595959;
}

/* Hamburger — hidden on desktop */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  width: 28px;
  height: 28px;
}

.bar {
  display: block;
  width: 20px;
  height: 1.5px;
  background: #000;
  transform-origin: center;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

/* X state */
.bar:nth-child(1).open {
  transform: translateY(6.5px) rotate(45deg);
}
.bar:nth-child(2).open {
  opacity: 0;
  transform: scaleX(0);
}
.bar:nth-child(3).open {
  transform: translateY(-6.5px) rotate(-45deg);
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

  .hamburger {
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
    gap: 20px;
    padding: 0 8px;
    font-size: 16px;
    transition: padding 0.25s ease;
  }

  .mobile-nav-wrap.open .mobile-nav {
    padding: 8px 8px;
  }

  .mobile-nav a {
    color: #000;
    text-decoration: none;
  }

  .mobile-nav a.active {
    color: #595959;
  }
}
</style>
