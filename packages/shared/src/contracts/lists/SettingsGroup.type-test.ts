import type { SettingsGroupProps } from './SettingsGroup'

const acceptsSettingsGroup = (_props: SettingsGroupProps) => undefined

acceptsSettingsGroup({ items: [{ label: 'Language', value: 'English' }] })

// @ts-expect-error every item requires its visible label
acceptsSettingsGroup({ items: [{ value: 'English' }] })
// @ts-expect-error values are words, nodes belong in trailing
acceptsSettingsGroup({ items: [{ label: 'Theme', value: { type: 'badge' } }] })
// @ts-expect-error arbitrary children cannot be inserted between rows
acceptsSettingsGroup({ items: [], children: 'separator' })
