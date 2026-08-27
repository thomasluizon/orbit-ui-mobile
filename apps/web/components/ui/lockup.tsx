import type { LockupProps } from '@orbit/shared/contracts/brand'
import { LOCKUP_MARK_PATHS, LOCKUP_WORD_PATH } from '@/components/ui/brand-paths'

export function Lockup(_props: Readonly<LockupProps>) {
  return (
    <svg
      width="89.395502773"
      height="17.882739221"
      viewBox="-0.000000087 0 89.395502773 17.882739221"
      fill="none"
      color="var(--fg-1)"
      aria-hidden="true"
      data-asset="orbit-lockup"
    >
      <g transform="translate(-11.101787705 -14.738114888) scale(0.049008704)">
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
      <g transform="translate(38.84610376 15.708)">
        <path d={LOCKUP_WORD_PATH} fill="currentColor" />
      </g>
    </svg>
  )
}
