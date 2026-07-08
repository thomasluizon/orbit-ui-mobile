import nextConfig from "eslint-config-next"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"
import tseslint from "typescript-eslint"
import sonarjs from "eslint-plugin-sonarjs"
import noComments from "../../eslint-rules/no-comments.cjs"

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
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "sonarjs/cognitive-complexity": ["warn", 15],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.d.ts"],
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: { "local/no-comments": "error", "no-console": "error" },
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
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
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
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "public/**",
      "*.config.{js,mjs,cjs,ts}",
    ],
  },
]
