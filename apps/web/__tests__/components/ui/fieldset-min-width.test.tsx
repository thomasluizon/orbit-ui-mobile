import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Proposed } from '@/components/ui/proposed'

const webRoot = process.cwd()
const sourceRoots = ['app', 'components']
const quoteCharacters = new Set(['"', "'", '`'])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

function openingEnd(source: string, from: number): number {
  let depth = 0
  let quote = ''
  for (let index = from; index < source.length; index += 1) {
    const char = source.charAt(index)
    if (quote) quote = char === quote ? '' : quote
    else if (quoteCharacters.has(char)) quote = char
    else if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return index
  }
  return source.length
}

function startsInComment(source: string, from: number): boolean {
  const lineStart = source.lastIndexOf('\n', from) + 1
  return /^\s*(\*|\/\/)/.test(source.slice(lineStart, from))
}

function fieldsetOpenings(source: string): string[] {
  const openings: string[] = []
  let from = source.indexOf('<fieldset')
  while (from !== -1) {
    const end = openingEnd(source, from)
    if (!startsInComment(source, from)) openings.push(source.slice(from, end + 1))
    from = source.indexOf('<fieldset', end)
  }
  return openings
}

function holdsMinWidth(opening: string): boolean {
  return /min-w-0|minWidth: 0|\bcontents\b/.test(opening)
}

describe('fieldset minimum width on web', () => {
  it('gives every fieldset in app and components a zero minimum width', () => {
    const missing = sourceRoots
      .flatMap((root) => sourceFiles(join(webRoot, root)))
      .flatMap((path) => fieldsetOpenings(readFileSync(path, 'utf8'))
        .filter((opening) => !holdsMinWidth(opening))
        .map((opening) => `${relative(webRoot, path)}: ${opening.slice(0, 80).replaceAll('\n', ' ')}`))
    expect(missing).toEqual([])
  })

  it.each([
    ['proposed', { proposed: true }],
    ['proposed and inset', { proposed: true, inset: true }],
    ['plain', { proposed: true, appearance: 'plain' as const }],
    ['not proposed and kept mounted', { proposed: false, keepMounted: true }],
    ['plain and kept mounted', { proposed: false, keepMounted: true, appearance: 'plain' as const }],
  ])('keeps a zero minimum width on the Proposed fieldset: %s', (_name, props) => {
    render(
      <Proposed scope="row" label="Proposed by Orbit" {...props}>
        <span>Value</span>
      </Proposed>,
    )
    const fieldset = screen.getByText('Value').closest('fieldset')
    expect(fieldset).not.toBeNull()
    expect(fieldset).toHaveClass('min-w-0')
  })
})
