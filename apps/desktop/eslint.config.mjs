import tseslint from "typescript-eslint"
import sonarjs from "eslint-plugin-sonarjs"
import noComments from "../../eslint-rules/no-comments.cjs"
import noFullbleedButton from "../../eslint-rules/no-fullbleed-button.cjs"
import noDecorativeGlow from "../../eslint-rules/no-decorative-glow.cjs"
import noDoubleAssertion from "../../eslint-rules/no-double-assertion.cjs"
import noOvershootEasing from "../../eslint-rules/no-overshoot-easing.cjs"
import noRawFontFeatureTag from "../../eslint-rules/no-raw-font-feature-tag.cjs"
import noRawGradient from "../../eslint-rules/no-raw-gradient.cjs"
import noOklch from "../../eslint-rules/no-oklch-outside-web-tokens.cjs"
import noUnjustifiedDisable from "../../eslint-rules/no-unjustified-disable.cjs"
import spacingScale from "../../eslint-rules/spacing-scale.cjs"

export default [
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
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
    files: ["**/*.ts"],
    plugins: { sonarjs },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",
      ...Object.fromEntries(
        Object.keys(sonarjs.configs.recommended.rules ?? {})
          .filter((full) => {
            const rule = sonarjs.rules[full.replace("sonarjs/", "")]
            return rule?.meta?.type === "problem" && rule?.meta?.docs?.recommended === true
          })
          .map((full) => [full, "error"]),
      ),
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  {
    files: ["scripts/**/*.ts", "__tests__/**/*.ts"],
    plugins: {
      local: {
        rules: {
          "no-comments": noComments,
          "no-fullbleed-button": noFullbleedButton,
          "no-decorative-glow": noDecorativeGlow,
          "no-double-assertion": noDoubleAssertion,
          "no-overshoot-easing": noOvershootEasing,
          "no-raw-font-feature-tag": noRawFontFeatureTag,
          "no-raw-gradient": noRawGradient,
          "no-oklch-outside-web-tokens": noOklch,
          "no-unjustified-disable": noUnjustifiedDisable,
          "spacing-scale": spacingScale,
        },
      },
    },
    rules: {
      "local/no-comments": "error",
      "local/no-double-assertion": "error",
      "local/spacing-scale": "error",
      "local/no-fullbleed-button": "error",
      "local/no-unjustified-disable": "error",
      "local/no-decorative-glow": "error",
      "local/no-overshoot-easing": "error",
      "local/no-raw-font-feature-tag": "error",
      "local/no-raw-gradient": "error",
      "local/no-oklch-outside-web-tokens": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
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
    ignores: ["node_modules/**", "coverage/**", "src-tauri/**", "*.config.{js,mjs,cjs,ts}"],
  },
]
