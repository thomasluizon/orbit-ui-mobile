import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
    path: require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
    weight: 400,
  },
  {
    path: require.resolve('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
    weight: 600,
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

function parseNamedResources(source: string, elementName: 'color' | 'string') {
  const resources = new Map<string, string>()
  let currentName: string | undefined
  let currentText = ''
  const parser = new SaxesParser()

  parser.on('opentag', tag => {
    if (tag.name !== elementName) return
    currentName = String(tag.attributes.name)
    currentText = ''
  })
  parser.on('text', text => {
    if (currentName) currentText += text
  })
  parser.on('closetag', tag => {
    if (tag.name !== elementName || !currentName) return
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
  locale: 'en' | 'pt-rBR',
  embeddedFonts: string,
) {
  const fixture = PICKER_PREVIEW_FIXTURE
  const card = requiredResource(colors, 'widget_card')
  const well = requiredResource(colors, 'widget_well')
  const hairline = requiredResource(colors, 'widget_hairline')
  const fg1 = requiredResource(colors, 'widget_fg_1')
  const fg2 = requiredResource(colors, 'widget_fg_2')
  const fg3 = requiredResource(colors, 'widget_fg_3')
  const streak = requiredResource(colors, 'widget_streak_text')
  const overdue = requiredResource(colors, 'widget_overdue')
  const languageTag = locale === 'pt-rBR' ? 'pt-BR' : locale
  const today = requiredResource(strings, 'widget_today').toLocaleUpperCase(languageTag)
  const subtitle = `${fixture.completed} ${requiredResource(strings, 'widget_of')} ` +
    `${fixture.total} ${requiredResource(strings, 'widget_completed')}`
  const streakUnit = requiredResource(strings, 'widget_streak_unit')
  const deeper = requiredResource(strings, 'widget_deeper_count').replace('%1$d', '2')

  const rows = fixture.rows.map((row, index) => {
    const rowTop = 48 + index * 48
    const centerY = rowTop + 24
    const titleColor = row.status === 'done' ? fg3 : fg1
    const timeColor = row.status === 'overdue' ? overdue : fg3
    const rowBorder = row.status === 'done' ? '' : ` stroke="${hairline}" stroke-width="1"`
    const rowBackground = `<rect x="0.5" y="${rowTop + 0.5}" width="335" height="47" ` +
      `rx="16" fill="${well}"${rowBorder}/>`
    const extra = index === 2
      ? `<rect x="210" y="${rowTop + 9}" width="34" height="18" rx="8" fill="${well}"/>` +
        `<text x="227" y="${rowTop + 22}" text-anchor="middle" fill="${fg2}" ` +
        'font-size="11">2/3</text>' +
        `<text x="324" y="${rowTop + 28}" text-anchor="end" fill="${fg3}" ` +
        `font-size="11">${escaped(deeper)}</text>`
      : ''
    return rowBackground + statusMark(row.status, centerY, colors) +
      `<text x="42" y="${rowTop + 20}" fill="${titleColor}" font-size="15">` +
      `${escaped(requiredResource(strings, row.nameKey))}</text>` +
      `<text x="42" y="${rowTop + 36}" fill="${timeColor}" font-size="11" ` +
      `letter-spacing="0.22">${row.time}</text>${extra}`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fixture.width * 4}" ` +
    `height="${fixture.height * 4}" viewBox="0 0 ${fixture.width} ${fixture.height}">` +
    `<defs><style>${embeddedFonts}</style>` +
    '<clipPath id="card"><rect width="336" height="192" rx="24"/></clipPath></defs>' +
    '<g clip-path="url(#card)" font-family="WidgetGeist">' +
    `<rect width="336" height="192" fill="${card}"/>` +
    `<rect x="0.5" y="0.5" width="335" height="191" rx="23.5" fill="none" ` +
    `stroke="${hairline}" stroke-width="1"/>` +
    `<text x="12" y="18" fill="${fg3}" font-size="13" font-weight="600" ` +
    `letter-spacing="0.52">${escaped(today)}</text>` +
    `<text x="12" y="35" fill="${fg3}" font-size="11">${escaped(subtitle)}</text>` +
    `<text x="250" y="28" text-anchor="end" fill="${streak}" font-size="15" ` +
    `font-weight="600">${fixture.streak}</text>` +
    `<text x="253" y="28" fill="${fg3}" font-size="11">${escaped(streakUnit)}</text>` +
    `<path d="M319.7 16.4A8 8 0 1 0 321.8 26h-2.1a6 6 0 1 1-1.6-8.2L315 21h7v-7z" ` +
    `fill="${fg3}" transform="translate(-3 -1) scale(.82) translate(72 4)"/>` +
    `<rect y="47" width="336" height="1" fill="${hairline}"/>${rows}</g></svg>`
}

async function loadEmbeddedFonts() {
  const faces = await Promise.all(previewFontPaths.map(async font => ({
    bytes: await readFile(font.path),
    weight: font.weight,
  })))
  return faces.map(font =>
    '@font-face{font-family:WidgetGeist;' +
    `src:url(data:font/ttf;base64,${font.bytes.toString('base64')}) format('truetype');` +
    `font-style:normal;font-weight:${font.weight}}`,
  ).join('')
}

async function loadPreviewInputs(locale: 'en' | 'pt-rBR', mode: PreviewMode) {
  const stringsDirectory = locale === 'en' ? 'values' : 'values-pt-rBR'
  const colorsDirectory = mode === 'light' ? 'values' : 'values-night'
  const [stringsSource, colorsSource] = await Promise.all([
    readFile(path.join(widgetResourceDirectory, stringsDirectory, 'widget_strings.xml'), 'utf8'),
    readFile(path.join(widgetResourceDirectory, colorsDirectory, 'widget_colors.xml'), 'utf8'),
  ])
  return {
    strings: parseNamedResources(stringsSource, 'string'),
    colors: parseNamedResources(colorsSource, 'color'),
  }
}

export async function generateWidgetPreview() {
  const embeddedFonts = await loadEmbeddedFonts()
  for (const output of PICKER_PREVIEW_OUTPUTS) {
    const { strings, colors } = await loadPreviewInputs(output.locale, output.mode)
    const outputDirectory = path.join(widgetResourceDirectory, output.directory)
    await mkdir(outputDirectory, { recursive: true })
    await sharp(Buffer.from(previewSvg(strings, colors, output.locale, embeddedFonts)))
      .png({
        progressive: false,
        compressionLevel: 9,
        adaptiveFiltering: false,
        palette: false,
      })
      .toFile(path.join(outputDirectory, 'widget_picker_preview.png'))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateWidgetPreview().catch((error: unknown) => {
    process.exitCode = 1
    throw error
  })
}
