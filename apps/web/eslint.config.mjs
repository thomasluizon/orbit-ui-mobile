import next from 'eslint-config-next'

export default [
  ...next,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'e2e/**',
      'coverage/**',
      'playwright-report/**',
      'public/**',
      '*.config.{js,mjs,cjs,ts}',
    ],
  },
]
