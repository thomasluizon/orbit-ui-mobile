export function releaseShellNoticeRenderer<T>(current: T | null, registered: T): T | null {
  return current === registered ? null : current
}
