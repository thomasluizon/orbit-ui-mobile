import { beforeAll } from 'vitest'

// WHY: https://github.com/thomasluizon/orbit-tickets/issues/1111 keeps cold auth imports outside query assertion deadlines.
beforeAll(async () => {
  await import('@/stores/auth-store')
})
