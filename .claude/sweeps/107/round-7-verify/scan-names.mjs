// READ-ONLY: complement to round-7-a11y-scan. For every mobile interactive
// element (onPress/onLongPress), require an ACCESSIBLE NAME OR a child <Text>.
// Flags icon-only pressables that have a role but no label and no text child.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files apps/mobile', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f) && !/__tests__/.test(f))

const TAGS = ['Pressable', 'TouchableOpacity', 'TouchableWithoutFeedback', 'TouchableHighlight', 'TouchableNativeFeedback']
const flagged = []
let total = 0

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const tagRe = new RegExp('<(' + TAGS.join('|') + ')\\b', 'g')
  let m
  while ((m = tagRe.exec(src)) !== null) {
    // find end of open tag
    let i = tagRe.lastIndex, depth = 0, end = -1
    while (i < src.length) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth <= 0) { end = i; break }
      i++
    }
    const openTag = src.slice(m.index, end + 1)
    const hasPress = /onPress\s*=|onLongPress\s*=/.test(openTag)
    if (!hasPress) continue
    const hidden = /importantForAccessibility\s*=\s*[{"]\s*"?no/.test(openTag) || /accessibilityElementsHidden/.test(openTag)
    if (hidden) continue
    total++
    const hasLabel = /accessibilityLabel|aria-label/.test(openTag)
    // find the element body up to a heuristic close to detect a <Text> child
    const bodySlice = src.slice(end + 1, end + 1 + 600)
    const hasTextChild = /<Text\b/.test(bodySlice) || /\{t\(/.test(bodySlice) || /children/.test(openTag)
    if (!hasLabel && !hasTextChild) {
      const lineNo = src.slice(0, m.index).split(/\n/).length
      flagged.push(`${f}:${lineNo} <${m[1]}> no label + no obvious <Text> child`)
    }
  }
}

console.log('Interactive (onPress) scanned:', total)
console.log('FLAGGED missing accessible name (no label, no Text child within 600 chars):', flagged.length)
console.log(flagged.join('\n'))
