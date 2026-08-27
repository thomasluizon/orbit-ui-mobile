import type { OrbitMarkProps } from '@orbit/shared/contracts/brand'
import { ORBIT_MARK_16_PATHS, ORBIT_MARK_PATHS } from '@/components/ui/brand-paths'

export function OrbitMark({ size = 24, accent = false }: Readonly<OrbitMarkProps>) {
  const isNativeSize = size < 20
  const paths = isNativeSize ? ORBIT_MARK_16_PATHS : ORBIT_MARK_PATHS

  return (
    <svg
      width={size}
      height={size}
      viewBox={isNativeSize ? '0 0 16 16' : '0 0 1024 1024'}
      fill="none"
      color="var(--fg-1)"
      aria-hidden="true"
      data-asset={isNativeSize ? 'orbit-mark-16' : accent ? 'orbit-mark-accent' : 'orbit-mark'}
      data-accent={accent ? '' : undefined}
    >
      {paths.map((path, index) => (
        <path
          key={path.d}
          d={path.d}
          fill={accent && index === paths.length - 1 ? 'var(--primary)' : 'currentColor'}
          fillRule={path.fillRule}
          clipRule={path.fillRule}
          data-part={index === paths.length - 1 ? 'moon' : undefined}
        />
      ))}
    </svg>
  )
}
