/** A label unique to this run, used to name every habit the smoke suite creates
 *  so overlapping runs never collide and teardown can target only its own data. */
export function smokeLabel(flow: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const nonce = Math.random().toString(36).slice(2, 7)
  return `smoke ${flow} ${stamp} ${nonce}`
}
