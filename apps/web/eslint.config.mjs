import nextConfig from "eslint-config-next"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypeScript from "eslint-config-next/typescript"

export default [
  ...nextConfig,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "e2e/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
      "*.config.{js,mjs,cjs,ts}",
    ],
  },
]
