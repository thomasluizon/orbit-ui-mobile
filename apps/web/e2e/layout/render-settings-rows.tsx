import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListRow } from '../../components/ui/list-row'
import { BarChart3, Mail } from '../../components/ui/icons'

const { labels, habitName } = JSON.parse(readFileSync(0, 'utf8')) as {
  labels: string[]
  habitName?: string
}

const rows = habitName === undefined
  ? [
    createElement(ListRow, { title: labels[0]!, chevron: false, textMode: 'label' }),
    createElement(ListRow, { title: labels[0]!, chevron: false, textMode: 'label' }),
  ]
  : [
    createElement(ListRow, { title: labels[0]!, icon: createElement(BarChart3, { size: 24 }), chevron: false, textMode: 'label', toggle: { checked: true, onChange: () => {} } }),
    createElement(ListRow, { title: labels[1]!, icon: createElement(Mail, { size: 24 }), chevron: false, textMode: 'label', toggle: { checked: true, onChange: () => {} } }),
    createElement(ListRow, { title: labels[2]!, chevron: false, textMode: 'label', onClick: () => {} }),
    createElement(ListRow, { title: labels[3]!, chevron: false, textMode: 'label' }),
    createElement(ListRow, { title: habitName, textMode: 'personal', chevron: false }),
  ]

process.stdout.write(renderToStaticMarkup(createElement('main', null, ...rows)))
