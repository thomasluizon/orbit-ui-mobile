import nextConfig from "eslint-config-next"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"
import tseslint from "typescript-eslint"
import sonarjs from "eslint-plugin-sonarjs"
import noComments from "../../eslint-rules/no-comments.cjs"
import noFullbleedButton from "../../eslint-rules/no-fullbleed-button.cjs"
import animatePresenceExit from "../../eslint-rules/animate-presence-exit.cjs"
import animatePresenceStableKey from "../../eslint-rules/animate-presence-stable-key.cjs"
import noCalcPercentageWidth from "../../eslint-rules/no-calc-percentage-width.cjs"
import noDeadHref from "../../eslint-rules/no-dead-href.cjs"
import noDecorativeGlow from "../../eslint-rules/no-decorative-glow.cjs"
import noDynamicTailwindClass from "../../eslint-rules/no-dynamic-tailwind-class.cjs"
import noGradientText from "../../eslint-rules/no-gradient-text.cjs"
import noJsxLogicalAnd from "../../eslint-rules/no-jsx-logical-and.cjs"
import noNestedComponentDefinition from "../../eslint-rules/no-nested-component-definition.cjs"
import noOvershootEasing from "../../eslint-rules/no-overshoot-easing.cjs"
import noPlaceholderAlt from "../../eslint-rules/no-placeholder-alt.cjs"
import noRawFontFeatureTag from "../../eslint-rules/no-raw-font-feature-tag.cjs"
import noRawGradient from "../../eslint-rules/no-raw-gradient.cjs"
import noScrollListenerMotion from "../../eslint-rules/no-scroll-listener-motion.cjs"
import noSideStripeBorder from "../../eslint-rules/no-side-stripe-border.cjs"
import noSpaceXY from "../../eslint-rules/no-space-x-y.cjs"
import noUserScalableNo from "../../eslint-rules/no-user-scalable-no.cjs"
import react19Api from "../../eslint-rules/react19-api.cjs"
import requireDialogTitle from "../../eslint-rules/require-dialog-title.cjs"
import requireFocusReplacement from "../../eslint-rules/require-focus-replacement.cjs"
import willChangeDiscipline from "../../eslint-rules/will-change-discipline.cjs"

export default [
  ...nextConfig,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
          "no-fullbleed-button": noFullbleedButton,
          "animate-presence-exit": animatePresenceExit,
          "animate-presence-stable-key": animatePresenceStableKey,
          "no-calc-percentage-width": noCalcPercentageWidth,
          "no-dead-href": noDeadHref,
          "no-decorative-glow": noDecorativeGlow,
          "no-dynamic-tailwind-class": noDynamicTailwindClass,
          "no-gradient-text": noGradientText,
          "no-jsx-logical-and": noJsxLogicalAnd,
          "no-nested-component-definition": noNestedComponentDefinition,
          "no-overshoot-easing": noOvershootEasing,
          "no-placeholder-alt": noPlaceholderAlt,
          "no-raw-font-feature-tag": noRawFontFeatureTag,
          "no-raw-gradient": noRawGradient,
          "no-scroll-listener-motion": noScrollListenerMotion,
          "no-side-stripe-border": noSideStripeBorder,
          "no-space-x-y": noSpaceXY,
          "no-user-scalable-no": noUserScalableNo,
          "react19-api": react19Api,
          "require-dialog-title": requireDialogTitle,
          "require-focus-replacement": requireFocusReplacement,
          "will-change-discipline": willChangeDiscipline,
        },
      },
    },
    rules: {
      "local/no-comments": "error",
      "local/no-fullbleed-button": ["error", { flagFullWidthProp: false }],
      "no-console": "error",

      "local/animate-presence-stable-key": "error",
      "local/no-calc-percentage-width": "error",
      "local/no-dead-href": "error",
      "local/no-gradient-text": "error",
      "local/no-jsx-logical-and": "error",
      "local/no-nested-component-definition": "error",
      "local/no-overshoot-easing": "error",
      "local/no-placeholder-alt": "error",
      "local/no-raw-font-feature-tag": "error",
      "local/no-side-stripe-border": "error",
      "local/no-user-scalable-no": "error",
      "local/require-dialog-title": "error",
      "local/will-change-discipline": "error",

      // Staged at `warn`: current code violates these, and the fix is not this bundle's.
      // Bundle 5 (#539) de-decorates the UI — it deletes the glow/gradient tokens and their
      // ~46 call sites — and flips these two to `error` in the same PR. `error` today would
      // fail CI on code that is only waiting its turn.
      // https://github.com/thomasluizon/orbit-ui-mobile/issues/539
      "local/no-decorative-glow": "warn",
      "local/no-raw-gradient": "warn",

      // Staged at `warn`: pre-existing violations that are NOT bundle 5's de-decoration work.
      // Each needs its own judgement call (a11y fix, motion fix, perf rewrite, React 19
      // migration), so they are surfaced rather than silenced, and flip to `error` per rule as
      // its backlog is cleared. Counts + the to-do list are in the bundle 4a report on #539.
      // https://github.com/thomasluizon/orbit-ui-mobile/issues/539
      "local/animate-presence-exit": "warn",
      "local/no-dynamic-tailwind-class": "warn",
      "local/no-scroll-listener-motion": "warn",
      "local/no-space-x-y": "warn",
      "local/react19-api": "warn",
      "local/require-focus-replacement": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    rules: {
      // #539 "enable, don't write": these ship with jsx-a11y and were entirely UNSET here,
      // not merely at warn. The codebase already satisfies all but one.
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/alt-text": "error",
      "react-hooks/exhaustive-deps": "error",

      // Staged at `warn`: one violation — a `draggable` <section> carrying drag handlers
      // (components/goals/goal-list.tsx). Making drag-and-drop keyboard-operable is a real
      // a11y feature, not a lint fix; flips to `error` once that lands.
      // https://github.com/thomasluizon/orbit-ui-mobile/issues/539
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
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
      "**/calendar-sync/**",
      "**/onboarding/**",
      "**/(auth)/**",
      "**/*empty-state.tsx",
      "**/*-no-data-state.tsx",
    ],
    rules: { "local/no-fullbleed-button": "off" },
  },
  {
    rules: {
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
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "local/no-fullbleed-button": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "public/**",
      "*.config.{js,mjs,cjs,ts}",
    ],
  },
]
