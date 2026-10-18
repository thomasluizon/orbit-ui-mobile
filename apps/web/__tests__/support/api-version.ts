import { expect } from 'vitest'

export function expectApiVersion2Requests(calls: readonly (readonly unknown[])[]): void {
  for (const [input, init] of calls) {
    const headers = new Headers((init as RequestInit | undefined)?.headers)
    expect(headers.get('api-version'), String(input)).toBe('2.0')
  }
}
