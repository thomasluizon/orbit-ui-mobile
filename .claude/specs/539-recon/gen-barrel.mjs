import fs from 'node:fs'
const { map } = JSON.parse(fs.readFileSync(new URL('./icon-map-final.json', import.meta.url)))
const RENAME = { Infinity: 'InfinityIcon' } // JS restricted global -> safe const name; re-exported under the original name via an alias (which creates no binding, so it is lint-safe)
const entries = Object.entries(map).map(([lucide, tabler]) => [RENAME[lucide] || lucide, tabler])
const distinctTabler = [...new Set(entries.map((e) => e[1]))].sort()
fs.writeFileSync(new URL('./icon-renames.json', import.meta.url), JSON.stringify(RENAME, null, 1))

function barrel({ pkg, platform }) {
  const importLines = distinctTabler.join(',\n  ')
  const exportLines = entries.map(([name, tabler]) => `export const ${name} = makeIcon(${tabler})`).join('\n')
  const aliasLines = Object.entries(RENAME).map(([orig, safe]) => `export { ${safe} as ${orig} }`).join('\n')
  const strokeAssign = platform === 'web' ? 'stroke={stroke ?? strokeWidth}' : 'strokeWidth={strokeWidth}'
  const destructure = platform === 'web'
    ? '{ size = 22, strokeWidth = 1.8, stroke, ...rest }'
    : '{ size = 22, strokeWidth = 1.8, ...rest }'
  const extraWebProp = platform === 'web' ? '\n  stroke?: number | string' : ''
  return `/**
 * Orbit icon barrel (${platform}). The ONE place app icons come from: Tabler icons wrapped
 * to a Lucide-compatible prop shape (\`strokeWidth\` default 1.8, \`size\` default 22) so callsites
 * are unchanged and a future icon-set swap is this single file. Direct '@tabler/*' / 'lucide-*'
 * imports are banned outside this file. #539 b6 (Lucide -> Tabler).
 */
import type { ComponentType } from 'react'
import {
  type Icon as TablerIcon,
  type IconProps as TablerIconProps,
  ${importLines},
} from '${pkg}'

/** Lucide-compatible icon props. \`strokeWidth\` maps to Tabler's stroke width. */
export interface IconProps extends Omit<TablerIconProps, 'stroke'> {
  strokeWidth?: number | string${extraWebProp}
}
export type LucideProps = IconProps
export type LucideIcon = ComponentType<IconProps>

function makeIcon(Tabler: TablerIcon): ComponentType<IconProps> {
  return function Icon(${destructure}: IconProps) {
    return <Tabler size={size} ${strokeAssign} {...rest} />
  }
}

${exportLines}

${aliasLines}
`
}

fs.writeFileSync('apps/web/components/ui/icons.tsx', barrel({ pkg: '@tabler/icons-react', platform: 'web' }))
fs.writeFileSync('apps/mobile/components/ui/icons.tsx', barrel({ pkg: '@tabler/icons-react-native', platform: 'mobile' }))
console.log('wrote barrels:', entries.length, 'exports +', Object.keys(RENAME).length, 'alias;', distinctTabler.length, 'tabler imports')
