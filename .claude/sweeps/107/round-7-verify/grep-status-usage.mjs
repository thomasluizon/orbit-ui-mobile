// READ-ONLY: enumerate EVERY status-overdue/status-bad token + raw amber/red hex
// usage across both apps; print file:line + the matched line so each can be
// classified text-on-solid vs text-on-same-tone-tint vs non-text by inspection.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files apps/web apps/mobile packages/shared', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) && !/__tests__/.test(f) && f.length)

// token usages
const tokenRe = /(--status-overdue\b|--status-bad\b|--status-overdue-text\b|--status-bad-text\b|statusOverdue\b|statusBad\b|statusOverdueText\b|statusBadText\b)/
// raw amber / red status hexes (the design status palette values), case-insensitive
const rawHexRe = /#(?:e17100|b45b00|fe9a00|e7000b|fb2c36|f54900|ec003f|ff2056|dc2626|ef4444|f59e0b|fbbf24|d97706|b91c1c)\b/i

const tokenHits = []
const rawHits = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  lines.forEach((ln, i) => {
    if (tokenRe.test(ln)) tokenHits.push(`${f}:${i + 1}: ${ln.trim()}`)
    if (rawHexRe.test(ln)) rawHits.push(`${f}:${i + 1}: ${ln.trim()}`)
  })
}

// Heuristic classifier: does the matched line look like a TEXT color vs a
// background/border/fill/non-text usage? (color: / textColor / *Text style key
// vs background/border/fill/shadow/tint). Output the guess for triage.
function classify(line) {
  const body = line.slice(line.indexOf(': ') + 2)
  const isBgOrBorder = /background|border|fill=|shadow|Shadow|gradient|tint|@1A|@14|@2|@18|, 0x|rgba\([^)]*0?\.[0-2]/i.test(body)
  const isColorProp = /(^|[^-])\bcolor\b\s*[:=]|textColor|color:\s*var|color=\{|text-\[var\(--status/i.test(body)
  const isTextStyleKey = /(Text|Title|Reason|Label|Link|count|message|copy|warning|chip)\b\s*:\s*\{?/i.test(body) && isColorProp
  if (isColorProp || isTextStyleKey) return 'TEXT?'
  if (isBgOrBorder) return 'BG/BORDER/TINT?'
  return 'OTHER?'
}

console.log('=== TOKEN USAGES (count ' + tokenHits.length + ') ===')
for (const h of tokenHits) console.log(`[${classify(h)}] ${h}`)
console.log('\n=== RAW STATUS-HEX USAGES (count ' + rawHits.length + ') ===')
for (const h of rawHits) console.log(`[${classify(h)}] ${h}`)
