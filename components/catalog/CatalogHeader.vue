<script setup lang="ts">
const route = useRoute();
const { loggedIn } = useAuth();
const isHome = computed(() => route.path === "/");
</script>

<template>
  <header class="catalog-head">
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
  </header>
</template>

<style scoped>
.catalog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #000;
  flex: 0 0 auto;
  font-family: Arial, Helvetica, sans-serif;
  background: #fff;
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

@media (max-width: 750px) {
  .catalog-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
  }
  .top-nav {
    font-size: 16px;
  }
}
</style>
