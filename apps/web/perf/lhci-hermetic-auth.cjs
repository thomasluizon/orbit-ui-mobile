/* eslint-disable @typescript-eslint/no-require-imports -- LHCI require()s this file as a CommonJS puppeteerScript module, so require/module.exports are mandatory here */
const { mintHermeticJwt, HERMETIC_SESSION_EXPIRES } = require('../e2e/visual/hermetic-session.cjs')

function sessionCookie(name, token) {
  return {
    name,
    value: token,
    domain: '127.0.0.1',
    path: '/',
    expires: HERMETIC_SESSION_EXPIRES,
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  }
}

/**
 * LHCI `collect.puppeteerScript`. Runs once against the Chrome instance LHCI
 * launched, before the URL's audits, injecting Bundle B1's hermetic fake-JWT
 * cookies so the authenticated Today surface renders instead of the login redirect.
 * The cookies persist across every Lighthouse run because LHCI keeps the browser
 * open, and Lighthouse's per-run storage reset clears cache/localStorage but never
 * cookies, so each run stays signed in while auditing a cold cache (real
 * script-transfer sizes). Reuses B1's minting + cookie attributes verbatim via
 * hermetic-session.cjs. The mock's free-tier profile fixture (trialEndsAt null)
 * never triggers the trial-expired overlay, so no localStorage flag is needed.
 * @param {import('puppeteer-core').Browser} browser Chrome launched by LHCI.
 * @returns {Promise<void>}
 */
module.exports = async (browser) => {
  const token = mintHermeticJwt()
  await browser.setCookie(sessionCookie('auth_token', token), sessionCookie('refresh_token', token))
  console.log('[lhci] hermetic auth cookies injected (auth_token + refresh_token)')
}
