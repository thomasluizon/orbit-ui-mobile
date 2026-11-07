const CHALLENGE_ORIGIN = 'https://challenges.cloudflare.com'
const CHALLENGE_DOCUMENTS = new Set(['about:srcdoc', 'about:blank'])
const ORIGIN_BOUNDARIES = new Set(['/', '?', '#'])

export const TURNSTILE_ORIGIN_ALLOWLIST = ['*']

// WHY: React Native's global URL has no canParse and throws on about: fragments https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/Libraries/Blob/URL.js
function isOnOrigin(url: string, origin: string): boolean {
  if (!url.startsWith(origin)) return false
  return url.length === origin.length || ORIGIN_BOUNDARIES.has(url.charAt(origin.length))
}

export function shouldLoadTurnstileFrame(
  request: Readonly<{ url: string; isTopFrame: boolean }>,
  bridgeOrigin: string,
): boolean {
  if (request.isTopFrame) return isOnOrigin(request.url, bridgeOrigin)
  return CHALLENGE_DOCUMENTS.has(request.url) || isOnOrigin(request.url, CHALLENGE_ORIGIN)
}
