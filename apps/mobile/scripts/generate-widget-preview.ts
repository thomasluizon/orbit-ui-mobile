import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { SaxesParser } from 'saxes'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const mobileDirectory = path.resolve(scriptDirectory, '..')
const require = createRequire(import.meta.url)
const widgetResourceDirectory = path.join(
  mobileDirectory,
  'modules/orbit-widget/android/src/main/res',
)

const previewFontPaths = [
  {
    path: require.resolve('@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf'),
    weight: 400,
  },
  {
    path: require.resolve('@expo-google-fonts/roboto/500Medium/Roboto_500Medium.ttf'),
    weight: 500,
  },
] as const

type PreviewStatus = 'done' | 'overdue' | 'pending'
type PreviewMode = 'light' | 'dark'

export const PICKER_PREVIEW_FIXTURE = {
  width: 336,
  height: 192,
  completed: 3,
  total: 7,
  streak: 12,
  rows: [
    { nameKey: 'widget_preview_done_name', time: '08:00', status: 'done' },
    { nameKey: 'widget_preview_overdue_name', time: '18:00', status: 'overdue' },
    { nameKey: 'widget_preview_pending_name', time: '09:00', status: 'pending' },
  ] satisfies readonly Readonly<{
    nameKey: string
    time: string
    status: PreviewStatus
  }>[],
} as const

export const PICKER_PREVIEW_OUTPUTS = [
  { locale: 'en', mode: 'light', directory: 'drawable-xxxhdpi' },
  { locale: 'en', mode: 'dark', directory: 'drawable-night-xxxhdpi' },
  { locale: 'pt-rBR', mode: 'light', directory: 'drawable-pt-rBR-xxxhdpi' },
  { locale: 'pt-rBR', mode: 'dark', directory: 'drawable-pt-rBR-night-xxxhdpi' },
] as const satisfies readonly Readonly<{
  locale: 'en' | 'pt-rBR'
  mode: PreviewMode
  directory: string
}>[]

function parseNamedResources(source: string, elementName: 'color' | 'string' | 'dimen') {
  const resources = new Map<string, string>()
  let currentName: string | undefined
  let currentText = ''
  let pluralName: string | undefined
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    if (tag.name === 'plurals') pluralName = String(tag.attributes.name)
    if (tag.name === 'item' && tag.attributes.quantity === 'other' && pluralName) {
      currentName = pluralName
      currentText = ''
      return
    }
    if (tag.name !== elementName) return
    currentName = String(tag.attributes.name)
    currentText = ''
  })
  parser.on('text', text => {
    if (currentName) currentText += text
  })
  parser.on('closetag', tag => {
    if (tag.name === 'plurals') pluralName = undefined
    if ((tag.name !== elementName && tag.name !== 'item') || !currentName) return
    resources.set(currentName, currentText)
    currentName = undefined
  })
  parser.write(source).close()

  return resources
}

function requiredResource(resources: ReadonlyMap<string, string>, name: string) {
  const value = resources.get(name)
  if (value === undefined) throw new Error(`Missing widget resource: ${name}`)
  return value
}

function escaped(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function statusMark(status: PreviewStatus, centerY: number, colors: ReadonlyMap<string, string>) {
  const fg1 = requiredResource(colors, 'widget_fg_1')
  const markBackground = requiredResource(colors, 'widget_well')
  const overdue = requiredResource(colors, 'widget_overdue')
  const track = requiredResource(colors, 'widget_track_empty')

  if (status === 'done') {
    return `<circle cx="22" cy="${centerY}" r="10" fill="${fg1}"/>` +
      `<path d="M16.2 ${centerY + 0.1}l3.9 3.9 7.7-7.7" fill="none" stroke="${markBackground}" ` +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
  }
  if (status === 'overdue') {
    return `<path d="M22 ${centerY - 7.8}l8 14.8H14z" fill="none" stroke="${overdue}" ` +
      'stroke-width="1.7" stroke-linejoin="round"/>' +
      `<path d="M22 ${centerY - 3}v4" stroke="${overdue}" stroke-width="1.7" ` +
      'stroke-linecap="round"/>' +
      `<circle cx="22" cy="${centerY + 3}" r="1" fill="${overdue}"/>`
  }
  return `<circle cx="22" cy="${centerY}" r="8.5" fill="none" stroke="${track}" ` +
    'stroke-width="1.5"/>'
}

function previewSvg(
  strings: ReadonlyMap<string, string>,
  colors: ReadonlyMap<string, string>,
  embeddedFonts: string,
  dimensions: ReadonlyMap<string, string>,
) {
  const fixture = PICKER_PREVIEW_FIXTURE
  const card = requiredResource(colors, 'widget_card')
  const well = requiredResource(colors, 'widget_well')
  const hairline = requiredResource(colors, 'widget_hairline')
  const fg1 = requiredResource(colors, 'widget_fg_1')
  const fg3 = requiredResource(colors, 'widget_fg_3')
  const streak = requiredResource(colors, 'widget_streak_text')
  const overdue = requiredResource(colors, 'widget_overdue')
  const today = requiredResource(strings, 'widget_today')
  const subtitle = `${fixture.completed}/${fixture.total}`
  const streakUnit = requiredResource(strings, 'widget_streak_unit')
  const dimension = (name: string) => Number.parseFloat(requiredResource(dimensions, name))
  const inset = dimension('widget_inset_card')
  const headerHeight = dimension('widget_touch_target')
  const headerGap = dimension('widget_header_list_gap')
  const rowHeight = dimension('widget_row_height')
  const rowGap = dimension('widget_row_gap')
  const available = fixture.height - 2 * inset - headerHeight - headerGap
  const rowCount = Math.floor((available + rowGap) / (rowHeight + rowGap))
  const cardHeight = 2 * inset + headerHeight + headerGap + rowCount * (rowHeight + rowGap) - rowGap

  const rows = fixture.rows.slice(0, rowCount).map((row, index) => {
    const rowTop = inset + headerHeight + headerGap + index * (rowHeight + rowGap)
    const centerY = rowTop + rowHeight / 2
    const titleColor = row.status === 'done' ? fg3 : fg1
    const timeColor = row.status === 'overdue' ? overdue : fg3
    const rowBorder = row.status === 'done' ? '' : ` stroke="${hairline}" stroke-width="1"`
    const rowBackground = `<rect x="${inset + 0.5}" y="${rowTop + 0.5}" width="${fixture.width - 2 * inset - 1}" ` +
      `height="${rowHeight - 1}" rx="16" fill="${well}"${rowBorder}/>`
    return rowBackground + `<g transform="translate(${inset + 4} 0)">` +
      statusMark(row.status, centerY, colors) + '</g>' +
      `<text id="widget_preview_habit" x="${inset + 44}" y="${rowTop + 28}" fill="${titleColor}" font-size="15">` +
      `${escaped(requiredResource(strings, row.nameKey))}</text>` +
      `<text x="${inset + 44}" y="${rowTop + 46}" fill="${timeColor}" font-size="12" ` +
      `letter-spacing="0.22">${row.time}</text>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fixture.width * 4}" ` +
    `height="${fixture.height * 4}" viewBox="0 0 ${fixture.width} ${fixture.height}">` +
    `<defs><style>${embeddedFonts}</style>` +
    `<clipPath id="card"><rect width="336" height="${cardHeight}" rx="24"/></clipPath></defs>` +
    '<g clip-path="url(#card)" font-family="Roboto">' +
    `<rect width="336" height="${cardHeight}" fill="${card}"/>` +
    `<rect x="0.5" y="0.5" width="335" height="${cardHeight - 1}" rx="23.5" fill="none" ` +
    `stroke="${hairline}" stroke-width="1"/>` +
    `<circle cx="36" cy="48" r="10" fill="none" ` +
    `stroke="${requiredResource(colors, 'widget_track_empty')}" stroke-width="2"/>` +
    `<circle cx="36" cy="48" r="10" fill="none" stroke="${fg1}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-dasharray="${2 * Math.PI * 10 * fixture.completed / fixture.total} ` +
    `${2 * Math.PI * 10}" transform="rotate(-90 36 48)"/>` +
    `<text id="widget_preview_header" x="56" y="42" fill="${fg3}" font-size="13" font-weight="500">${escaped(today)}</text>` +
    `<text x="56" y="59" fill="${fg3}" font-size="12">${escaped(subtitle)}</text>` +
    `<text id="widget_preview_streak" x="84" y="59" fill="${streak}" font-size="15" ` +
    `font-weight="500">${fixture.streak}</text>` +
    `<text x="106" y="59" fill="${fg3}" font-size="12">${escaped(streakUnit)}</text>` +
    `<path d="M296 48a8 8 0 1 1-2.3-5.7M296 40v6h-6" fill="none" ` +
    `stroke="${fg3}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `${rows}</g></svg>`

  return svg.replaceAll('><', '>\n<')
}

async function loadEmbeddedFonts() {
  const faces = await Promise.all(previewFontPaths.map(async font => ({
    bytes: await readFile(font.path),
    weight: font.weight,
  })))
  return faces.map(font =>
    '@font-face{font-family:Roboto;' +
    `src:url(data:font/ttf;base64,${font.bytes.toString('base64')}) format('truetype');` +
    `font-style:normal;font-weight:${font.weight}}`,
  ).join('\n')
}

async function renderPreviewsWithBundledFonts(previews: Awaited<ReturnType<typeof buildWidgetPreviewSvgs>>) {
  const fontFiles = previewFontPaths.map(font => font.path)
  for (const { output, svg } of previews) {
    const outputDirectory = path.join(widgetResourceDirectory, output.directory)
    const rendered = new Resvg(svg, {
      font: { defaultFontFamily: 'Roboto', fontFiles, loadSystemFonts: false },
    }).render().asPng()
    await mkdir(outputDirectory, { recursive: true })
    await sharp(rendered)
      .png({
        progressive: false,
        compressionLevel: 9,
        adaptiveFiltering: false,
        palette: false,
      })
      .toFile(path.join(outputDirectory, 'widget_picker_preview.png'))
  }
}

async function loadPreviewInputs(locale: 'en' | 'pt-rBR', mode: PreviewMode) {
  const stringsDirectory = locale === 'en' ? 'values' : 'values-pt-rBR'
  const colorsDirectory = mode === 'light' ? 'values' : 'values-night'
  const [stringsSource, colorsSource, dimensionsSource] = await Promise.all([
    readFile(path.join(widgetResourceDirectory, stringsDirectory, 'widget_strings.xml'), 'utf8'),
    readFile(path.join(widgetResourceDirectory, colorsDirectory, 'widget_colors.xml'), 'utf8'),
    readFile(path.join(widgetResourceDirectory, 'values', 'widget_dimens.xml'), 'utf8'),
  ])
  return {
    strings: parseNamedResources(stringsSource, 'string'),
    colors: parseNamedResources(colorsSource, 'color'),
    dimensions: parseNamedResources(dimensionsSource, 'dimen'),
  }
}

export async function generateWidgetPreview() {
  const previews = await buildWidgetPreviewSvgs()
  await renderPreviewsWithBundledFonts(previews)
}

export async function buildWidgetPreviewSvgs() {
  const embeddedFonts = await loadEmbeddedFonts()
  return await Promise.all(PICKER_PREVIEW_OUTPUTS.map(async output => {
    const { strings, colors, dimensions } = await loadPreviewInputs(output.locale, output.mode)
    return {
      output,
      svg: previewSvg(strings, colors, embeddedFonts, dimensions),
    }
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateWidgetPreview().catch((error: unknown) => {
    process.exitCode = 1
    throw error
  })
}
