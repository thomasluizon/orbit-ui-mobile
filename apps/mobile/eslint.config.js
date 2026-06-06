// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config")
const expoConfig = require("eslint-config-expo/flat")
const reactHooks = require("eslint-plugin-react-hooks")
const noComments = require("../../eslint-rules/no-comments.cjs")

// eslint-config-expo@55 ships react-hooks v5, which pre-dates the React 19 /
// Compiler rules (set-state-in-effect, refs, immutability, etc.). Strip the
// expo registration and re-register with v7 so disable directives that
// reference the new rules resolve correctly and the rules actually fire.
const expoConfigArray = Array.isArray(expoConfig) ? expoConfig : [expoConfig]
const patchedExpoConfig = expoConfigArray.map((c) => {
  if (c && c.plugins && c.plugins["react-hooks"]) {
    const { ["react-hooks"]: _stripped, ...rest } = c.plugins
    return { ...c, plugins: rest }
  }
  return c
})

module.exports = defineConfig([
  ...patchedExpoConfig,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: { "local/no-comments": "error" },
  },
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
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
    },
  },
  {
    ignores: ["dist/*", ".expo/*"],
  },
])
