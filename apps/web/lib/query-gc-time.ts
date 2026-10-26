export function getQueryGcTime(browserGcTime: number): number {
  // WHY: Finite query timers retain server render caches and their request context. https://github.com/thomasluizon/orbit-tickets/issues/1735
  return typeof document === 'undefined' ? Infinity : browserGcTime
}
