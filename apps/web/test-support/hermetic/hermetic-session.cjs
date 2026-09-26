const FAR_FUTURE_EXP_SECONDS = 4102444800

/** Origin the built app is served on during the hermetic visual + perf runs. */
const VISUAL_ORIGIN = 'http://127.0.0.1:3000'

/** Cookie/JWT expiry (seconds since epoch, year 2100) so the session never refreshes. */
const HERMETIC_SESSION_EXPIRES = FAR_FUTURE_EXP_SECONDS

/**
 * Fixed instant the browser clock is pinned to (`page.clock.setFixedTime`) so every
 * `new Date()` the app computes (default due dates, "today" navigation) is stable.
 */
const FIXED_CLOCK_TIME = '2026-06-15T09:00:00.000Z'

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function mintHermeticJwt() {
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeSegment({
    sub: 'visual-preview-user',
    exp: FAR_FUTURE_EXP_SECONDS,
    iat: 1750000000,
  })
  return `${header}.${payload}.hermetic-visual-signature`
}

module.exports = {
  VISUAL_ORIGIN,
  HERMETIC_SESSION_EXPIRES,
  FIXED_CLOCK_TIME,
  mintHermeticJwt,
}
