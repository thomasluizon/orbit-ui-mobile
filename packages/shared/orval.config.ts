import { defineConfig } from 'orval'

const openApiSpecTarget =
  process.env.ORBIT_OPENAPI_SPEC ??
  'https://raw.githubusercontent.com/thomasluizon/orbit-api/main/src/Orbit.Api/openapi.json'

export default defineConfig({
  orbit: {
    input: {
      target: openApiSpecTarget,
    },
    output: {
      client: 'zod',
      mode: 'single',
      target: './src/types/__generated__/api.generated.ts',
      override: {
        zod: {
          version: 4,
        },
      },
    },
  },
})
