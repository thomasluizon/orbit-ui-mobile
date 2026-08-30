/* eslint-disable @typescript-eslint/no-require-imports -- LHCI require()s this file as a CommonJS puppeteerScript module, so require/module.exports are mandatory here */
const { mintHermeticJwt, HERMETIC_SESSION_EXPIRES } = require('../e2e/visual/hermetic-session.cjs')
const en = require('../../../packages/shared/src/i18n/en.json')

const WARMUP_NAVIGATION_COUNT = 4
const TODAY_EMPTY_STATE_MARKUP = `>${en.habits.noHabitsBody}<`

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
 *
 * It then WARMS the server and the shared Chrome renderer process, which is what
 * makes the budget measurable at all.
 * Measured over the 37 most recent runs (185 individual Lighthouse runs, from the
 * retained .lighthouseci artifacts): run 1 of a batch exceeded EVERY other run in
 * that batch 32 times out of 37. Cold p50 was 2816.7 ms of total blocking time
 * against a warm p50 of 797.5 ms, and the worst cold run reached 12006 ms. That is
 * the Next.js production server compiling the authenticated route on first request,
 * not the page being slow. It biased every batch median upward by one order
 * statistic, which is most of why a 950 ms budget failed roughly one run in ten.
 *
 * LHCI calls this ONCE per URL and then runs all N Lighthouse runs in separate
 * Node processes connected to the same Chrome instance
 * (@lhci/cli/src/collect/collect.js: invokePuppeteerScriptForUrl, then runOnUrl;
 * @lhci/cli/src/collect/node-runner.js: childProcess.spawn). Four fresh page
 * targets reproduce that shape before collection. Cache stays disabled on each
 * target so every warmup exercises the authenticated document and preload rather
 * than reusing static responses.
 *
 * The warmup fails SOFT but LOUD: a warmup error must not fail the gate, and a
 * warmup that silently stopped working would return the cold-start bias with
 * nobody noticing, so it prints what it did either way.
 *
 * @param {import('puppeteer-core').Browser} browser Chrome launched by LHCI.
 * @param {{url: string}} context The URL LHCI is about to audit.
 * @returns {Promise<void>}
 */
module.exports = async (browser, context) => {
  const token = mintHermeticJwt()
  await browser.setCookie(sessionCookie('auth_token', token), sessionCookie('refresh_token', token))
  console.log('[lhci] hermetic auth cookies injected (auth_token + refresh_token)')

  const url = context && context.url
  if (!url) {
    console.log('[lhci] WARMUP SKIPPED: LHCI passed no url, so run 1 will be a cold start')
    return
  }
  let serverRenderedCount = 0
  for (let navigation = 1; navigation <= WARMUP_NAVIGATION_COUNT; navigation++) {
    const startedAt = Date.now()
    let page
    try {
      page = await browser.newPage()
      await page.setCacheEnabled(false)
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
      const html = response ? await response.text() : ''
      const serverRendered = html.includes(TODAY_EMPTY_STATE_MARKUP)
      if (serverRendered) serverRenderedCount++
      console.log(
        `[lhci] warmup ${navigation}/${WARMUP_NAVIGATION_COUNT} to ${url} completed in ${Date.now() - startedAt} ms; Today preload ${serverRendered ? 'present in server markup' : 'MISSING from server markup'}`,
      )
    } catch (error) {
      console.log(
        `[lhci] WARMUP ${navigation}/${WARMUP_NAVIGATION_COUNT} FAILED after ${Date.now() - startedAt} ms: ${error.message}`,
      )
    } finally {
      if (page) await page.close().catch(() => {})
    }
  }

  console.log(
    `[lhci] warmup complete: ${serverRenderedCount}/${WARMUP_NAVIGATION_COUNT} authenticated responses contained the Today empty state in server markup`,
  )
}
