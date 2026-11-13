import {
  LOCKUP_HEIGHT,
  LOCKUP_MARK_PATHS,
  LOCKUP_MARK_TRANSFORM,
  LOCKUP_VIEW_BOX,
  LOCKUP_WIDTH,
  LOCKUP_WORD_PATH,
  LOCKUP_WORD_TRANSFORM,
  type LockupProps,
} from '@orbit/shared/contracts/brand'

export function Lockup(_props: Readonly<LockupProps>) {
  return (
    <svg
      width={LOCKUP_WIDTH}
      height={LOCKUP_HEIGHT}
      viewBox={LOCKUP_VIEW_BOX}
      fill="none"
      color="var(--fg-1)"
      aria-hidden="true"
      data-asset="orbit-lockup"
    >
      <g transform={LOCKUP_MARK_TRANSFORM}>
        {LOCKUP_MARK_PATHS.map((path) => (
          <path
            key={path.d}
            d={path.d}
            fill="currentColor"
            fillRule={path.fillRule}
            clipRule={path.fillRule}
          />
        ))}
      </g>
      <g transform={LOCKUP_WORD_TRANSFORM}>
        <path d={LOCKUP_WORD_PATH} fill="currentColor" />
      </g>
    </svg>
  )
}
