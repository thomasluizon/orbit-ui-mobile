import { readFileSync } from 'node:fs'

export const snapshotFixture = JSON.parse(readFileSync(new URL('./eval-snapshot.json', import.meta.url), 'utf8'))

export function evalSnapshot(collections = {}) {
  return { ...structuredClone(snapshotFixture.snapshot), ...collections }
}
