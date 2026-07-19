import fs from 'node:fs'
import path from 'node:path'
const IGNORE = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'ios', 'android', '.turbo'])
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!IGNORE.has(e.name)) walk(p, out) }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p)
  }
}
const targets = [
  { root: 'apps/web', src: 'lucide-react' },
  { root: 'apps/mobile', src: 'lucide-react-native' },
]
const BARREL_SUFFIX = 'components/ui/icons.tsx'
let changed = 0
const leftover = []
for (const { root, src } of targets) {
  const files = []
  walk(root, files)
  for (const f of files) {
    const norm = f.split(path.sep).join('/')
    if (norm.endsWith(BARREL_SUFFIX)) continue
    let s = fs.readFileSync(f, 'utf8')
    if (!s.includes(src)) continue
    const before = s
    s = s.replace(new RegExp('(from\\s*)([\'"])' + src + '\\2', 'g'), "$1'@/components/ui/icons'")
    s = s.replace(new RegExp('(import\\s*\\(\\s*)([\'"])' + src + '\\2(\\s*\\))', 'g'), "$1'@/components/ui/icons'$3")
    s = s.replace(new RegExp('(vi\\.mock\\s*\\(\\s*)([\'"])' + src + '\\2', 'g'), "$1'@/components/ui/icons'")
    if (s !== before) { fs.writeFileSync(f, s); changed++ }
    if (s.includes("'" + src + "'") || s.includes('"' + src + '"')) leftover.push(f)
  }
}
console.log('files changed:', changed)
console.log('leftover lucide refs:', leftover.length ? '\n  ' + leftover.join('\n  ') : 'none')
