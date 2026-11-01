/* eslint-disable @typescript-eslint/no-require-imports -- The hermetic session producer is CommonJS, so this authentication adapter uses require/module.exports */
const { mintHermeticJwt, HERMETIC_SESSION_EXPIRES } = require('../test-support/hermetic/hermetic-session.cjs')
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
 * Auth cookies enable audits; logged warmup avoids cold-start bias without failing the gate.
 * @param {import('puppeteer-core').Browser} browser Chrome shared with Lighthouse.
 * @param {{url: string}} context The URL Lighthouse is about to audit.
 * @returns {Promise<void>}
 */
module.exports = async (browser, context) => {
  const token = mintHermeticJwt()
  await browser.setCookie(sessionCookie('auth_token', token), sessionCookie('refresh_token', token))
  console.log('[lighthouse] hermetic auth cookies injected (auth_token + refresh_token)')

  const url = context && context.url
  if (!url) {
    console.log('[lighthouse] WARMUP SKIPPED: Lighthouse passed no url, so run 1 will be a cold start')
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
        `[lighthouse] warmup ${navigation}/${WARMUP_NAVIGATION_COUNT} to ${url} completed in ${Date.now() - startedAt} ms; Today preload ${serverRendered ? 'present in server markup' : 'MISSING from server markup'}`,
      )
    } catch (error) {
      console.log(
        `[lighthouse] WARMUP ${navigation}/${WARMUP_NAVIGATION_COUNT} FAILED after ${Date.now() - startedAt} ms: ${error.message}`,
      )
    } finally {
      if (page) await page.close().catch(() => {})
    }
  }

  console.log(
    `[lighthouse] warmup complete: ${serverRenderedCount}/${WARMUP_NAVIGATION_COUNT} authenticated responses contained the Today empty state in server markup`,
  )
}
