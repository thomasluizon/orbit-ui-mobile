const FAR_FUTURE_EXP_SECONDS = 4102444800

/** Cookie/JWT expiry (seconds since epoch, year 2100) so the session never refreshes. */
const HERMETIC_SESSION_EXPIRES = FAR_FUTURE_EXP_SECONDS

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * The BFF reads expiry and account identity; the mock API reads the optional profile.
 * @returns {string} an unsigned JWT the BFF accepts for the hermetic session.
 */
function mintHermeticJwt(profile) {
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeSegment({
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': 'hermetic-perf-user',
    exp: FAR_FUTURE_EXP_SECONDS,
    iat: 1750000000,
    ...(profile ? { hermeticProfile: profile } : {}),
  })
  return `${header}.${payload}.hermetic-test-signature`
}

module.exports = {
  HERMETIC_SESSION_EXPIRES,
  mintHermeticJwt,
}
