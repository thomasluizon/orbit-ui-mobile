import {
  ORBIT_MARK_VIEW_BOX,
  ORBIT_MARK_PATHS,
  type OrbitMarkProps,
} from '@orbit/shared/contracts/brand'

export function OrbitMark({ size = 24, accent = false }: Readonly<OrbitMarkProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={ORBIT_MARK_VIEW_BOX}
      fill="none"
      color="var(--fg-1)"
      aria-hidden="true"
      data-asset={accent ? 'orbit-mark-accent' : 'orbit-mark'}
      data-accent={accent ? '' : undefined}
    >
      {ORBIT_MARK_PATHS.map((path, index) => (
        <path
          key={path.d}
          d={path.d}
          fill={accent && index === ORBIT_MARK_PATHS.length - 1 ? 'var(--primary)' : 'currentColor'}
          fillRule={path.fillRule}
          clipRule={path.fillRule}
          data-part={index === ORBIT_MARK_PATHS.length - 1 ? 'moon' : undefined}
        />
      ))}
    </svg>
  )
}
