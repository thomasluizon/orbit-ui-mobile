import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsRow } from '../../components/ui/settings-row'
import { SettingsGroupRow } from '../../components/ui/settings-group'
import { BarChart3, Mail } from '../../components/ui/icons'
import { Switch } from '../../components/ui/switch'

const { labels, habitName } = JSON.parse(readFileSync(0, 'utf8')) as {
  labels: string[]
  habitName?: string
}

const rows = habitName === undefined
  ? [
    createElement(SettingsRow, { label: labels[0]!, accessory: 'none' }),
    createElement(SettingsGroupRow, { label: labels[0]!, accessory: 'none' }),
  ]
  : [
    createElement(SettingsRow, { label: labels[0]!, icon: BarChart3, accessory: 'none' }, createElement(Switch, { checked: true, label: labels[0]!, onChange: () => {} })),
    createElement(SettingsRow, { label: labels[1]!, icon: Mail, accessory: 'none' }, createElement(Switch, { checked: true, label: labels[1]!, onChange: () => {} })),
    createElement(SettingsRow, { label: labels[2]!, accessory: 'none', onClick: () => {} }),
    createElement(SettingsGroupRow, { label: labels[3]!, accessory: 'none' }),
    createElement(SettingsRow, { label: habitName, textMode: 'personal', accessory: 'none' }),
  ]

process.stdout.write(renderToStaticMarkup(createElement('main', null, ...rows)))
