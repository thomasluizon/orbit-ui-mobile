import { GOOGLE_MARK_PATHS, GOOGLE_MARK_SIZE } from '@orbit/shared/contracts/brand'

export function GoogleMark() {
  return <svg width={GOOGLE_MARK_SIZE} height={GOOGLE_MARK_SIZE} viewBox="0 0 48 48"
    aria-hidden="true" focusable="false" data-asset="google-mark" className="shrink-0">
    {GOOGLE_MARK_PATHS.map((path) => <path key={path.fill} {...path} />)}
  </svg>
}
