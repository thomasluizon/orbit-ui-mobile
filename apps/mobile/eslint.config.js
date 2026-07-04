// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config")
const expoConfig = require("eslint-config-expo/flat")
const reactHooks = require("eslint-plugin-react-hooks")
const noComments = require("../../eslint-rules/no-comments.cjs")
const noGorhomSheet = require("../../eslint-rules/no-gorhom-sheet.cjs")

// https://github.com/expo/expo/issues/43758 — eslint-config-expo@56 bundles react-hooks v7 and
// turns on its full recommended set (refs, immutability, purity, …) at error. This project owns
// the react-hooks rule surface (the curated subset re-registered below), so strip both the plugin
// registration and its rule entries from the Expo config before re-registering v7 with only the
// rules we opt into.
const expoConfigArray = Array.isArray(expoConfig) ? expoConfig : [expoConfig]
const patchedExpoConfig = expoConfigArray.map((c) => {
  if (!c) return c
  let next = c
  if (c.plugins && c.plugins["react-hooks"]) {
    const { ["react-hooks"]: _stripped, ...rest } = c.plugins
    next = { ...next, plugins: rest }
  }
  if (c.rules && Object.keys(c.rules).some((key) => key.startsWith("react-hooks/"))) {
    const rules = Object.fromEntries(
      Object.entries(c.rules).filter(([key]) => !key.startsWith("react-hooks/")),
    )
    next = { ...next, rules }
  }
  return next
})

module.exports = defineConfig([
  ...patchedExpoConfig,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    plugins: {
      local: {
        rules: { "no-comments": noComments, "no-gorhom-sheet": noGorhomSheet },
      },
    },
    rules: { "local/no-comments": "error", "local/no-gorhom-sheet": "error", "no-console": "error" },
  },
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/display-name": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "app.config.js", "metro.config.js", "babel.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "expo/no-dynamic-env-var": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/*", ".expo/*"],
  },
])
