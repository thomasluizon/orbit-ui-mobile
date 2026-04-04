export function getTimezoneList(): string[] {
  if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
    return Intl.supportedValuesOf('timeZone')
  }
  return []
}
