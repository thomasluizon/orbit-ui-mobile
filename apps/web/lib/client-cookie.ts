const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function readClientCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  return new RegExp(String.raw`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1]
}

export function writeClientCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Strict; Secure`
}
