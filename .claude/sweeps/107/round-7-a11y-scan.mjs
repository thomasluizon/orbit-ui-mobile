import fs from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files apps/mobile', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\./.test(f) && !/__tests__/.test(f))

const TAGS = [
  'Pressable',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
  'TouchableHighlight',
  'TouchableNativeFeedback',
]

let total = 0
const flagged = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const tagRe = new RegExp('<(' + TAGS.join('|') + ')\\b', 'g')
  const matches = []
  let m
  while ((m = tagRe.exec(src)) !== null) {
    matches.push({ idx: m.index, name: m[1], after: tagRe.lastIndex })
  }
  for (const mm of matches) {
    total++
    let i = mm.after
    let depth = 0
    let end = -1
    while (i < src.length) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth <= 0) {
        end = i
        break
      }
      i++
    }
    const openTag = src.slice(mm.idx, end + 1)
    const hasRole = /accessibilityRole/.test(openTag)
    const hasPress = /onPress\s*=|onLongPress\s*=/.test(openTag)
    const isHidden =
      /importantForAccessibility\s*=\s*[{"]\s*"?no/.test(openTag) ||
      /accessibilityElementsHidden/.test(openTag)
    const lineNo = src.slice(0, mm.idx).split(/\n/).length
    if (!hasRole && hasPress && !isHidden) {
      flagged.push(`${f}:${lineNo} <${mm.name}>`)
    }
  }
}

console.log('TOTAL interactive tags:', total)
console.log('FLAGGED (onPress/onLongPress, no accessibilityRole, not hidden):', flagged.length)
console.log(flagged.join('\n'))
