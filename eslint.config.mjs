// Flat config. The Nuxt-generated half (`.nuxt/eslint.config.mjs`) already
// knows the project's auto-imports, component globals, and file layout, so it
// is extended rather than reproduced here. `eslint-config-prettier` comes last
// and switches off every stylistic rule, leaving formatting entirely to
// Prettier so the two tools cannot disagree about the same line.
import withNuxt from "./.nuxt/eslint.config.mjs";
import prettier from "eslint-config-prettier";

export default withNuxt(
  {
    rules: {
      // Unused code is the thing this repository is being cleaned of, so it is
      // an error rather than a warning. The underscore prefix stays available
      // for the deliberate discards (destructuring a key out of a query object,
      // for example).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      // `any` erases the type safety the rest of the config is trying to buy.
      "@typescript-eslint/no-explicit-any": "error",
      // Console output belongs behind `import.meta.dev` in app code. Warnings
      // and errors are left alone: they carry real operational signal.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "vue/multi-word-component-names": "off",
      // A Vue 2 constraint. Vue 3 templates may hold sibling roots, which
      // `pages/r/[slug].vue` relies on for its visually-hidden heading.
      "vue/no-multiple-template-root": "off",
    },
  },
  {
    // Build and maintenance scripts run in a terminal, where printing progress
    // is the point.
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
  prettier,
);
