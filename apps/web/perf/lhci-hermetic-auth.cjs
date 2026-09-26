/* eslint-disable @typescript-eslint/no-require-imports -- LHCI require()s this file as a CommonJS puppeteerScript module, so require/module.exports are mandatory here */
const { mintHermeticJwt, HERMETIC_SESSION_EXPIRES } = require('../test-support/hermetic/hermetic-session.cjs')

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

module.exports = async (browser, context) => {
  const token = mintHermeticJwt()
  await browser.setCookie(sessionCookie('auth_token', token), sessionCookie('refresh_token', token))
  console.log('[lhci] hermetic auth cookies injected (auth_token + refresh_token)')

  const url = context && context.url
  if (!url) {
    console.log('[lhci] WARMUP SKIPPED: LHCI passed no url, so run 1 will be a cold start')
    return
  }
  const startedAt = Date.now()
  let page
  try {
    page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
    console.log(`[lhci] warmup navigation to ${url} completed in ${Date.now() - startedAt} ms`)
  } catch (error) {
    console.log(`[lhci] WARMUP FAILED after ${Date.now() - startedAt} ms, run 1 will be a cold start: ${error.message}`)
  } finally {
    if (page) await page.close().catch(() => {})
  }
}
