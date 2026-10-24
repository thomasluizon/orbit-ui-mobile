import { fixtureFetch } from './public-api.mjs'

const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true, exhausted: false, capacity: 100,
  email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
globalThis.fetch = fixtureFetch(() => state)
