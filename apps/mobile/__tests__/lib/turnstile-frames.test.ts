import { expect, it } from 'vitest'
import { shouldLoadTurnstileFrame } from '@/lib/turnstile-frames'

const bridgeOrigin = 'https://app-staging.useorbit.org'
const bridgeUrl = `${bridgeOrigin}/turnstile-bridge?siteKey=site-key&theme=dark&language=pt-BR`

it.each([
  ['the bridge page in the top frame', bridgeUrl, true],
  ['a same-origin bridge redirect in the top frame', 'https://app-staging.useorbit.org/turnstile-bridge/?siteKey=site-key', true],
  ['the Cloudflare challenge page in the top frame', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAA/dark/fbE/new/normal/auto/', false],
  ['a Cloudflare privacy link in the top frame', 'https://www.cloudflare.com/privacypolicy/', false],
  ['the srcdoc document in the top frame', 'about:srcdoc', false],
  ['a blank document in the top frame', 'about:blank', false],
  ['another Orbit origin in the top frame', 'https://app.useorbit.org/turnstile-bridge?siteKey=site-key', false],
  ['a lookalike bridge host in the top frame', 'https://app-staging.useorbit.org.example.org/turnstile-bridge', false],
  ['a bridge host used as user info in the top frame', 'https://app-staging.useorbit.org@example.org/turnstile-bridge', false],
  ['a bridge host on another port in the top frame', 'https://app-staging.useorbit.org:8443/turnstile-bridge', false],
])('decides %s', (_case, url, expected) => {
  expect(shouldLoadTurnstileFrame({ url, isTopFrame: true }, bridgeOrigin)).toBe(expected)
})

it.each([
  ['the bridge page', bridgeUrl, true],
  ['a same-origin bridge redirect', 'https://app-staging.useorbit.org/turnstile-bridge/?siteKey=site-key', true],
  ['the Cloudflare challenge page', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAA/dark/fbE/new/normal/auto/', false],
  ['the srcdoc document', 'about:srcdoc', false],
  ['another origin', 'https://example.org/', false],
])('decides %s for an Android request without isTopFrame as the top frame', (_case, url, expected) => {
  expect(shouldLoadTurnstileFrame({ url }, bridgeOrigin)).toBe(expected)
})

it.each([
  ['the Cloudflare challenge frame', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAA/dark/fbE/new/normal/auto/', true],
  ['the srcdoc frame', 'about:srcdoc', true],
  ['a blank frame', 'about:blank', true],
  ['a Cloudflare frame on another port', 'https://challenges.cloudflare.com:8443/cdn-cgi/challenge-platform/', false],
  ['a lookalike Cloudflare host', 'https://challenges.cloudflare.com.example.org/', false],
  ['a Cloudflare host used as user info', 'https://challenges.cloudflare.com@example.org/', false],
  ['a srcdoc frame with a fragment', 'about:srcdoc#frame', false],
  ['another origin', 'https://example.org/frame', false],
  ['a javascript frame', 'javascript:alert(1)', false],
  ['a data frame', 'data:text/html,<p>frame</p>', false],
  ['an unparseable frame address', 'not a url', false],
])('decides %s in a subframe', (_case, url, expected) => {
  expect(shouldLoadTurnstileFrame({ url, isTopFrame: false }, bridgeOrigin)).toBe(expected)
})
