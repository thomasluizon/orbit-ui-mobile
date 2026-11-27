import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const rowBoxThatCentresMinHeightMustBeDiv = 'data-testid="habit-row"'
const roots = ['app', 'components'].map((name) => path.join(webRoot, name))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return file.endsWith('.tsx') ? [file] : []
  })
}

function openingTags(source: string): { tag: string; text: string; line: number }[] {
  const tags: { tag: string; text: string; line: number }[] = []
  for (const match of source.matchAll(/<([a-z][a-z0-9]*)(?=[\s/>])/g)) {
    let depth = 0
    let end = match.index
    for (; end < source.length; end += 1) {
      const character = source[end]
      if (character === '{') depth += 1
      else if (character === '}') depth -= 1
      else if (character === '>' && depth === 0 && source[end - 1] !== '=') break
    }
    tags.push({ tag: match[1]!, text: source.slice(match.index, end + 1), line: source.slice(0, match.index).split('\n').length })
  }
  return tags
}

describe('the group role', () => {
  it('names a set of related controls with a fieldset, never with role="group" on another element', () => {
    const found: string[] = []
    for (const file of roots.flatMap(sourceFiles)) {
      for (const { tag, text, line } of openingTags(readFileSync(file, 'utf8'))) {
        if (text.includes(rowBoxThatCentresMinHeightMustBeDiv)) continue
        if (tag !== 'fieldset' && /\brole=(?:"group"|\{[^}]*'group'[^}]*\})/.test(text)) found.push(`${path.relative(webRoot, file)}:${line}`)
      }
    }
    expect(found).toEqual([])
  })
})
