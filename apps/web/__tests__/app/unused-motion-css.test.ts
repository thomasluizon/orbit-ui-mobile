import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

const DELETED_MOTION_NAMES = [
  'page-enter',
  'page-leave',
  'layout-enter',
  'layout-leave',
  'stagger-enter',
  'slide-up-enter',
  'slide-up-leave',
  'slide-up-fade',
  'animate-slide-up',
  'animate-spin-slow',
  'animate-orbit-pulse',
  'orbit-pulse',
  'astra-orbit',
  'orbit-list-stagger',
]

describe('globals.css motion', () => {
  it.each(DELETED_MOTION_NAMES)('does not carry the unused %s rule', (name) => {
    expect(stylesheet).not.toContain(name)
  })
})
