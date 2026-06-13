// READ-ONLY: isolate BASE-tone tokens (NOT the -text variants) used as a TEXT
// color, and decide solid vs tint surface from surrounding source lines.
// The convergence claim: zero BASE-as-text on SOLID surfaces; any BASE-as-text
// that remains must be (a) an icon/non-text, or (b) on a same-tone TINT in the
// DEF-R7 family.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const files = execSync('git ls-files apps/web apps/mobile', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) && !/__tests__/.test(f) && f.length)

// BASE tokens only (negative lookahead for -text / Text suffix)
const webBase = /var\(--status-(overdue|bad)\)/         // excludes -text by exact match
const mobBase = /tokens\.status(Overdue|Bad)\b(?!Text)/ // excludes Text suffix

// Does this line apply the color to TEXT? color: / text-[var(...)] / textColor
// vs an icon (lucide <Icon color=...>) vs bg/border.
function role(line, file) {
  const isCss = file.endsWith('.css')
  // lucide/RN icon: capitalized component or known icon tag with color= prop
  if (/<[A-Z][A-Za-z]*\b[^>]*\bcolor=/.test(line) && !/<Text\b/.test(line)) return 'ICON'
  if (/\bfill=/.test(line) && !/color:/.test(line)) return 'ICON'
  if (/background|backgroundColor|border|borderColor|boxShadow|shadowColor|ring:|gradient|swatch|dotColor|discBg|tint:/i.test(line)) return 'BG/BORDER'
  if (/color:\s*(var\(--status|`?\$\{?tokens\.status|tokens\.status|'var\(--status|"var\(--status)/.test(line)) return 'TEXT'
  if (/text-\[var\(--status-(overdue|bad)\)\]/.test(line)) return 'TEXT'
  if (/\bcolor=\{?\s*(usageUrgent|trialUrgent|isStreak|habit\.isBadHabit|destructive|tone|pressed|token)/.test(line)) return 'ICON?' // conditional icon color
  if (/textColor:/.test(line)) return 'TEXT'
  return '??'
}

const hits = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  src.split(/\r?\n/).forEach((ln, i) => {
    const isWeb = f.startsWith('apps/web')
    const re = isWeb ? webBase : mobBase
    if (re.test(ln)) {
      const r = role(ln, f)
      hits.push({ f, line: i + 1, r, text: ln.trim() })
    }
  })
}

const byRole = {}
for (const h of hits) (byRole[h.r] ||= []).push(h)
console.log('BASE-tone (NON -text) token references:', hits.length, '\n')
for (const r of Object.keys(byRole).sort()) {
  console.log(`\n===== role=${r} (${byRole[r].length}) =====`)
  for (const h of byRole[r]) console.log(`${h.f}:${h.line}: ${h.text}`)
}
