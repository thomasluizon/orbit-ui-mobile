import tseslint from "typescript-eslint"
import sonarjs from "eslint-plugin-sonarjs"
import noComments from "../../eslint-rules/no-comments.cjs"
import noFullbleedButton from "../../eslint-rules/no-fullbleed-button.cjs"
import noDecorativeGlow from "../../eslint-rules/no-decorative-glow.cjs"
import noOvershootEasing from "../../eslint-rules/no-overshoot-easing.cjs"
import noRawFontFeatureTag from "../../eslint-rules/no-raw-font-feature-tag.cjs"
import noRawGradient from "../../eslint-rules/no-raw-gradient.cjs"
import spacingScale from "../../eslint-rules/spacing-scale.cjs"

export default [
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
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    plugins: {
      local: {
        rules: {
          "no-comments": noComments,
          "no-fullbleed-button": noFullbleedButton,
          "no-decorative-glow": noDecorativeGlow,
          "no-overshoot-easing": noOvershootEasing,
          "no-raw-font-feature-tag": noRawFontFeatureTag,
          "no-raw-gradient": noRawGradient,
          "spacing-scale": spacingScale,
        },
      },
    },
    rules: {
      "local/no-comments": "error",
      // `theme/button.ts` owns the pill-button geometry, which is a component
      // dimension rather than layout rhythm. The exemption lives HERE because this
      // is the config that lints that file - it sat in apps/web's config, which
      // never loads this package, so it was dead configuration.
      "local/spacing-scale": ["error", { exemptFiles: ["src/theme/button.ts"] }],
      "local/no-fullbleed-button": "error",

      // The #539 gates with a surface in pure data. Unlike apps/web and apps/mobile, this
      // package is already clean of all four, so they land at `error` directly. Note that
      // `theme/color-schemes.ts` owns `gradientHeaderFrom` as an object KEY, which these
      // rules deliberately do not match — bundle 5 deletes the token itself; a gate on the
      // file that defines it would report only its own definition.
      "local/no-decorative-glow": "error",
      "local/no-overshoot-easing": "error",
      "local/no-raw-font-feature-tag": "error",
      "local/no-raw-gradient": "error",

      // Staged at `warn`: 6 exported functions lack an explicit return type (query/keys.ts,
      // tour/tour-mock-data.ts, types/habit.ts, utils/{google-calendar-auth,
      // habit-form-helpers,notification-actions}.ts). This hardens the contract surface old
      // mobile clients read, so the annotations are worth adding deliberately rather than
      // inferring in bulk; flips to `error` once they land.
      // https://github.com/thomasluizon/orbit-ui-mobile/issues/539
      "@typescript-eslint/explicit-module-boundary-types": "warn",
    },
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
    files: ["src/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
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
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "src/types/__generated__/**",
      "*.config.{js,mjs,cjs,ts}",
    ],
  },
]
