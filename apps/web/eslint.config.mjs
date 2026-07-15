import nextConfig from "eslint-config-next"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"
import tseslint from "typescript-eslint"
import sonarjs from "eslint-plugin-sonarjs"
import noComments from "../../eslint-rules/no-comments.cjs"
import noFullbleedButton from "../../eslint-rules/no-fullbleed-button.cjs"

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
      local: { rules: { "no-comments": noComments, "no-fullbleed-button": noFullbleedButton } },
    },
    rules: {
      "local/no-comments": "error",
      "local/no-fullbleed-button": ["error", { flagFullWidthProp: false }],
      "no-console": "error",
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
