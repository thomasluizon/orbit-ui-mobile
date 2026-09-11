import timeZoneNames from '@vvo/tzdb/time-zones-names.json'

export function getTimezoneList(): string[] {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    return Intl.supportedValuesOf('timeZone')
  }

  return [...timeZoneNames]
}
