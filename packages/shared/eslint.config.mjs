import tseslint from "typescript-eslint"
import noComments from "../../eslint-rules/no-comments.cjs"

export default [
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.d.ts"],
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: { "local/no-comments": "error" },
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
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "*.config.{js,mjs,cjs,ts}"],
  },
]
