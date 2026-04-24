<script setup lang="ts">
const route = useRoute()
const { loggedIn } = useAuth()
</script>

<template>
  <header class="directory-head">
    <h1>The Restroom Archive</h1>
    <nav class="top-nav">
      <NuxtLink
        to="/about"
        :class="{ active: route.path === '/about' }"
      >About</NuxtLink>
      <NuxtLink
        to="/"
        :class="{ active: route.path === '/' || route.path.startsWith('/r/') }"
      >Directory</NuxtLink>
      <NuxtLink
        to="/account"
        :class="{ active: route.path === '/account' }"
      >{{ loggedIn ? 'Account' : 'Login' }}</NuxtLink>
    </nav>
  </header>
</template>

<style scoped>
.directory-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #000;
  flex: 0 0 auto;
  font-family: Arial, Helvetica, sans-serif;
  background: #fff;
}
.directory-head h1 {
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
  color: #b3b3b3;
}

@media (max-width: 750px) {
  .directory-head {
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
