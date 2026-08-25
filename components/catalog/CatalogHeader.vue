<script setup lang="ts">
/**
 * Site header: wordmark plus primary navigation.
 *
 * Rendered by every page, including those outside the catalog, so the wordmark
 * is an `h1` only on the home page and a `p` elsewhere. That keeps each page's
 * own heading as its document title rather than competing with a site-wide one.
 *
 * The links are declared once and rendered twice, into the inline nav and into
 * the drawer that replaces it in a narrow panel. Only one of the two is ever
 * displayed; which one is a CSS decision, so both stay in the markup.
 */
const route = useRoute();
const { loggedIn } = useAuth();

const isHome = computed(() => route.path === "/");
const menuOpen = ref(false);

const navItems = computed(() => [
  { to: "/about", label: "Info", active: route.path === "/about" },
  {
    to: "/",
    label: "Catalog",
    // A restroom's own URL is still the catalog, with a row expanded.
    active: route.path === "/" || route.path.startsWith("/r/"),
  },
  {
    to: "/account",
    label: loggedIn.value ? "Account" : "Login",
    active: route.path === "/account",
  },
]);

// A navigation is the drawer's whole purpose, so it closes once one happens.
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
        <a href="/">The Restroom Archive</a>
      </component>

      <nav class="top-nav">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="{ active: item.active }"
        >
          {{ item.label }}
        </NuxtLink>
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
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="{ active: item.active }"
        >
          {{ item.label }}
        </NuxtLink>
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
  /* One gutter and one nav size for the row, the toggle and the drawer under
     it, stepped by panel width alongside the rest of the panel (see the
     container query below) so whichever nav is showing matches the controls. */
  --head-gutter: 16px;
  --nav-font: 14px;
}

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--head-gutter);
}

.site-title {
  margin: 0;
  font-size: 24px;
  font-weight: 400;
  color: #000;
}

.site-title a {
  color: inherit;
  text-decoration: none;
}

.top-nav {
  display: flex;
  gap: 20px;
  font-size: var(--nav-font);
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

/* Menu toggle. Hidden on desktop. */
.menu-toggle {
  display: none;
  align-items: center;
  justify-content: flex-end;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  /* Fixed width so the row doesn't shift when the label swaps to the ✕. */
  min-width: 44px;
  font-family: inherit;
  font-size: var(--nav-font);
  line-height: 1;
  color: #000;
}

/* Same hover treatment as the nav links; pointer devices only. */
@media (hover: hover) {
  .menu-toggle:hover {
    color: #595959;
  }
}

/* Mobile nav drawer. Hidden on desktop. */
.mobile-nav-wrap {
  display: none;
}

/* Compact scale, on the same panel-width step as the catalog controls and the
   list. The title holds at 24px, because it is the brand anchor rather than part
   of the type
   scale. */
@container panel (max-width: 560px) {
  .catalog-head {
    --head-gutter: 8px;
    --nav-font: 12px;
  }
}

/* Whether the links fit is a question about the panel, not the window: the
   title plus the three links need ~384px of row, which the panel stops having
   at about 390px wide, reached at a 790px viewport, while a viewport-keyed
   switch was still showing them down to 750px and wrapping the title onto two
   lines. Handing off at 440px leaves slack for font metrics that differ by
   platform rather than sitting on the exact fit. */
@container panel (max-width: 440px) {
  .top-nav {
    display: none;
  }

  .menu-toggle {
    display: flex;
    /* Bottom-align with the site title's baseline instead of the row's
       vertical center. */
    align-self: flex-end;
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
    padding: 0 var(--head-gutter);
    font-size: var(--nav-font);
    transition: padding 0.25s ease;
  }

  .mobile-nav-wrap.open .mobile-nav {
    padding: 0 var(--head-gutter) 8px;
  }

  .mobile-nav a {
    color: #000;
    text-decoration: none;
  }

  .mobile-nav a.active {
    color: #595959;
  }

  /* Reached with a mouse in a narrow panel. On a phone `hover: hover` is
     false and this never applies. */
  @media (hover: hover) {
    .mobile-nav a:hover {
      color: #595959;
    }
  }
}
</style>
