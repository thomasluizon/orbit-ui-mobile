// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config")
const expoConfig = require("eslint-config-expo/flat")
const tseslint = require("typescript-eslint")
const sonarjs = require("eslint-plugin-sonarjs")
const reactHooks = require("eslint-plugin-react-hooks")
const noComments = require("../../eslint-rules/no-comments.cjs")
const noGorhomSheet = require("../../eslint-rules/no-gorhom-sheet.cjs")
const noFullbleedButton = require("../../eslint-rules/no-fullbleed-button.cjs")
const animatePresenceExit = require("../../eslint-rules/animate-presence-exit.cjs")
const animatePresenceStableKey = require("../../eslint-rules/animate-presence-stable-key.cjs")
const noArbitraryZindex = require("../../eslint-rules/no-arbitrary-zindex.cjs")
const noDecorativeGlow = require("../../eslint-rules/no-decorative-glow.cjs")
const noJsxLogicalAnd = require("../../eslint-rules/no-jsx-logical-and.cjs")
const noOvershootEasing = require("../../eslint-rules/no-overshoot-easing.cjs")
const noRawFontFeatureTag = require("../../eslint-rules/no-raw-font-feature-tag.cjs")
const noRawGradient = require("../../eslint-rules/no-raw-gradient.cjs")
const noScrollListenerMotion = require("../../eslint-rules/no-scroll-listener-motion.cjs")
const noSideStripeBorder = require("../../eslint-rules/no-side-stripe-border.cjs")

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
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    plugins: {
      local: {
        rules: {
          "no-comments": noComments,
          "no-gorhom-sheet": noGorhomSheet,
          "no-fullbleed-button": noFullbleedButton,
          "animate-presence-exit": animatePresenceExit,
          "animate-presence-stable-key": animatePresenceStableKey,
          "no-arbitrary-zindex": noArbitraryZindex,
          "no-decorative-glow": noDecorativeGlow,
          "no-jsx-logical-and": noJsxLogicalAnd,
          "no-overshoot-easing": noOvershootEasing,
          "no-raw-font-feature-tag": noRawFontFeatureTag,
          "no-raw-gradient": noRawGradient,
          "no-scroll-listener-motion": noScrollListenerMotion,
          "no-side-stripe-border": noSideStripeBorder,
        },
      },
    },
    rules: {
      "local/no-comments": "error",
      "local/no-gorhom-sheet": "error",
      "local/no-fullbleed-button": ["error", { flagFullWidthProp: true }],
      "no-console": "error",

      // The cross-platform half of the #539 gate set. Rules absent here are web-only by
      // scope, not by oversight: the Tailwind/CSS-string rules (no-space-x-y,
      // require-focus-replacement, no-calc-percentage-width, no-dynamic-tailwind-class,
      // no-gradient-text, will-change-discipline, no-user-scalable-no, no-dead-href,
      // require-dialog-title, no-placeholder-alt) have no RN surface — apps/mobile styles via
      // StyleSheet objects and NativeWind is unused scaffolding. `local/react19-api` is held
      // back per the #539 spec, though apps/mobile is in fact pinned to react 19.2.3 by the
      // root override, so it could be extended here in a follow-up.
      "local/animate-presence-exit": "error",
      "local/animate-presence-stable-key": "error",
      "local/no-arbitrary-zindex": "error",
      "local/no-jsx-logical-and": "error",
      "local/no-overshoot-easing": "error",
      "local/no-raw-font-feature-tag": "error",
      "local/no-scroll-listener-motion": "error",
      "local/no-side-stripe-border": "error",

      // Bundle 5 (#539) de-decorated both platforms — glow and gradient tokens and their call
      // sites (LinearGradient here, GradientTop on web) are gone, so these flip to `error`.
      // https://github.com/thomasluizon/orbit-ui-mobile/issues/539
      "local/no-decorative-glow": "error",
      "local/no-raw-gradient": "error",
    },
  },
  {
    files: [
      "**/*-sheet.tsx",
      "**/*-modal.tsx",
      "**/*-dialog.tsx",
      "**/*-drawer.tsx",
      "**/*-overlay.tsx",
      "**/*-prompt.tsx",
      "**/*-form.tsx",
      "**/*-celebration.tsx",
      "**/*-picker.tsx",
      "**/*-gate.tsx",
      "**/upgrade/**",
      "**/goal-detail-drawer/**",
      "**/calendar-sync.tsx",
      "**/wrapped-slide.tsx",
      "**/onboarding/**",
      "**/email-step.tsx",
      "**/code-step.tsx",
      "**/*empty-state.tsx",
      "**/*-no-data-state.tsx",
    ],
    rules: { "local/no-fullbleed-button": "off" },
  },
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/static-components": "error",
      // refs is enforced at "error": the former useRef-lazy-init reads during
      // render were converted to stable useState instances (Animated.Value) and
      // the render-phase ref writes were moved into effects, so no ref is read
      // or written during render. Keeps future ref-read-during-render out of CI.
      "react-hooks/refs": "error",
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
      "local/no-fullbleed-button": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
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
