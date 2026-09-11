import timeZoneNames from '@vvo/tzdb/time-zones-names.json'

const UTC_TIME_ZONE = 'UTC'
const UTC_ALIASES = new Set([UTC_TIME_ZONE, 'Etc/UTC'])

function withSelectableUtc(timeZones: readonly string[]): string[] {
  return [UTC_TIME_ZONE, ...timeZones.filter((timeZone) => !UTC_ALIASES.has(timeZone))]
}

export function getTimezoneList(): string[] {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    return withSelectableUtc(Intl.supportedValuesOf('timeZone'))
  }

  return withSelectableUtc(timeZoneNames)
}
