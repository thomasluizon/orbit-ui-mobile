import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertNoHydrationErrors } from '../../e2e/layout/hydration-guard'

function productionHydrationErrors(fixServerClock: boolean): string[] {
  const script = `
    import { JSDOM } from 'jsdom'
    import { createElement, useEffect } from 'react'
    import { renderToString } from 'react-dom/server'
    import { hydrateRoot } from 'react-dom/client'
    import { LAYOUT_FIXED_TIME } from './e2e/layout/clock.mjs'
    const serverTime = ${fixServerClock} ? new Date() : new Date('2026-10-01T12:00:00Z')
    let finishHydration
    const hydrationFinished = new Promise((resolve) => { finishHydration = resolve })
    function Clock({ instant }) {
      useEffect(() => { finishHydration() }, [])
      return createElement('time', null, instant)
    }
    const dom = new JSDOM('<div id="root">' + renderToString(createElement(Clock, { instant: serverTime.toISOString() })) + '</div>')
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    const errors = []
    const root = hydrateRoot(document.getElementById('root'),
      createElement(Clock, { instant: new Date(LAYOUT_FIXED_TIME).toISOString() }),
      { onRecoverableError: (error) => errors.push(error.message) })
    await hydrationFinished
    root.unmount()
    dom.window.close()
    process.stdout.write(JSON.stringify(errors))
  `
  const { NODE_OPTIONS: nodeOptions, ...environment } = process.env
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...environment, NODE_ENV: 'production', TZ: 'UTC',
      ...(fixServerClock ? { NODE_OPTIONS: `${nodeOptions ?? ''} --import ./e2e/layout/server-clock.mjs` } : {}) },
    encoding: 'utf8',
    timeout: 10_000,
  })
  return JSON.parse(output)
}

describe('layout hydration guard', () => {
  it('rejects the actual production React error from a server and client date mismatch', () => {
    const errors = productionHydrationErrors(false)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Minified React error #418;')
    expect(() => assertNoHydrationErrors(errors)).toThrow('Layout hydration mismatch:')
  })

  it('hydrates without recoverable errors when the server clock matches the fixture', () => {
    const errors = productionHydrationErrors(true)
    expect(errors).toEqual([])
    expect(() => assertNoHydrationErrors(errors)).not.toThrow()
  })

  it('keeps every layout spec on the guarded clock fixture', () => {
    const directory = 'e2e/layout'
    const specs = readdirSync(directory).filter((name) => name.endsWith('.spec.ts'))
    expect(specs.length).toBeGreaterThan(0)
    for (const name of specs) {
      const source = readFileSync(`${directory}/${name}`, 'utf8')
      expect(source, name).toMatch(/import \{[^}]*\btest\b[^}]*\} from '\.\/(?:layout-test|upgrade-fixtures)'/)
      expect(source, name).not.toMatch(/page\.clock\.setFixedTime/)
    }
  })
})
