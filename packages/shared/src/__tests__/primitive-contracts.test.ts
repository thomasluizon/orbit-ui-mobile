import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ButtonProps, FabProps } from '../contracts/actions'
import type {
  AstraGlyphProps,
  IconProps,
  LockupProps,
  OrbitMarkProps,
} from '../contracts/brand'
import type {
  BadgeProps,
  ColumnsProps,
  InfoCardProps,
  PlanCardProps,
  ProgressBarProps,
  ProgressRingProps,
  StatTileProps,
} from '../contracts/display'

interface PrimitiveContractMap {
  StatTileProps: StatTileProps
  ColumnsProps: ColumnsProps
  PlanCardProps: PlanCardProps
  InfoCardProps: InfoCardProps
  ProgressRingProps: ProgressRingProps
  ProgressBarProps: ProgressBarProps
  BadgeProps: BadgeProps
  ButtonProps: ButtonProps
  FabProps: FabProps
  OrbitMarkProps: OrbitMarkProps
  AstraGlyphProps: AstraGlyphProps
  IconProps: IconProps
  LockupProps: LockupProps
}

const CONTRACT_NAMES = [
  'StatTileProps',
  'ColumnsProps',
  'PlanCardProps',
  'InfoCardProps',
  'ProgressRingProps',
  'ProgressBarProps',
  'BadgeProps',
  'ButtonProps',
  'FabProps',
  'OrbitMarkProps',
  'AstraGlyphProps',
  'IconProps',
  'LockupProps',
] as const satisfies readonly (keyof PrimitiveContractMap)[]

type MissingContractName = Exclude<keyof PrimitiveContractMap, (typeof CONTRACT_NAMES)[number]>
const ALL_CONTRACT_NAMES_ARE_LISTED: MissingContractName extends never ? true : never = true

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.[jt]sx?$/.test(entry.name) ? [path] : []
  })
}

describe('primitive contracts', () => {
  it('exports every primitive prop type from its shared group barrel', () => {
    expect(ALL_CONTRACT_NAMES_ARE_LISTED).toBe(true)
  })

  it('declares each shared prop type outside both app component trees', () => {
    const appSources = ['apps/web/components', 'apps/mobile/components']
      .flatMap((path) => sourceFiles(join(repoRoot, path)))
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))

    for (const name of CONTRACT_NAMES) {
      const declaration = new RegExp(
        `^\\s*(?:export\\s+)?(?:interface\\s+${name}\\s*(?:extends\\b|\\{)|type\\s+${name}\\s*=)`,
        'm',
      )
      expect(
        appSources.filter(({ source }) => declaration.test(source)).map(({ path }) => path),
        `${name} must be declared only in packages/shared`,
      ).toEqual([])
    }
  })

  it('uses React for types only in shared primitive contracts', () => {
    const contractSources = sourceFiles(join(repoRoot, 'packages/shared/src/contracts'))
      .map((path) => readFileSync(path, 'utf8'))

    expect(contractSources.some((source) => /import\s+(?!type\b).*from ['"]react['"]/.test(source)))
      .toBe(false)
  })
})
