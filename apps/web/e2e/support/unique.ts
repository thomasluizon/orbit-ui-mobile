import { randomUUID } from 'node:crypto'

/** A label unique to this run, used to name every habit the smoke suite creates
 *  so overlapping runs never collide and teardown can target only its own data. */
export function smokeLabel(flow: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const nonce = randomUUID()
  return `smoke ${flow} ${stamp} ${nonce}`
}
