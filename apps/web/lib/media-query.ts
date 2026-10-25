export function getMediaQuery(query: string): MediaQueryList | null {
  // WHY: Crawlers can omit matchMedia, so browser consumers must check the capability. https://github.com/thomasluizon/orbit-tickets/issues/1713
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null
}

export function mediaQueryMatches(query: string, unavailable = false): boolean {
  return getMediaQuery(query)?.matches ?? unavailable
}
