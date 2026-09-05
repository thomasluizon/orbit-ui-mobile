const FAR_FUTURE_EXP_SECONDS = 4102444800

/** Cookie/JWT expiry (seconds since epoch, year 2100) so the session never refreshes. */
const HERMETIC_SESSION_EXPIRES = FAR_FUTURE_EXP_SECONDS

function encodeSegment(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * Mints an unsigned, far-future-`exp` JWT. The BFF never verifies the signature
 * (it only base64url-decodes `exp`), so this authenticates the hermetic session
 * with no signing key and no prod OTP. Minted at runtime to avoid secret-scanner
 * false positives on a committed token.
 * @returns {string} an unsigned JWT the BFF accepts for the hermetic session.
 */
function mintHermeticJwt() {
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' })
  const payload = encodeSegment({
    sub: 'hermetic-perf-user',
    exp: FAR_FUTURE_EXP_SECONDS,
    iat: 1750000000,
  })
  return `${header}.${payload}.hermetic-test-signature`
}

module.exports = {
  HERMETIC_SESSION_EXPIRES,
  mintHermeticJwt,
}
