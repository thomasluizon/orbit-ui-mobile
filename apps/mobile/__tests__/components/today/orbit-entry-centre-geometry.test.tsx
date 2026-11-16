import { act, create } from 'react-test-renderer'
import type { ViewStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

interface Host {
  type: string
  props: {
    style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle)
    testID?: string
    accessibilityLabel?: string
    width?: number
    height?: number
    viewBox?: string
    d?: string
    cx?: string | number
    cy?: string | number
    r?: string | number
  }
  children: (Host | string)[] | null
}

type Tree = ReturnType<typeof create> & { toJSON: () => Host | Host[]; unmount: () => void }

function descendants(host: Host): Host[] {
  return [host, ...(host.children ?? []).flatMap((child) => typeof child === 'string' ? [] : descendants(child))]
}

function measurable(host: Host): Host {
  if (host.type === 'Svg') return { ...host, props: { ...host.props, style: { width: host.props.width, height: host.props.height } }, children: null }
  return { ...host, children: host.children?.map((child) => typeof child === 'string' ? child : measurable(child)) ?? null }
}

/** The drawn ink of the mascot: its paths and circles, outside the clip definitions, rendered by resvg for the true bounds. */
function inkOf(svg: Host): string {
  return descendants(svg).filter((host) => host.type === 'Path' || host.type === 'Circle').map((host) => host.type === 'Path'
    ? `<path d="${host.props.d}"/>`
    : `<circle cx="${host.props.cx}" cy="${host.props.cy}" r="${host.props.r}"/>`).join('')
}

/** How far the drawn centre of the Orbit inside `owner` sits from the owner's own centre, in px. */
function drawnOffset(owner: Host, width: number) {
  const svg = descendants(owner).find((host) => host.type === 'Svg' && host.props.testID === 'orbit-mascot')!
  const bounds = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.props.viewBox}">${inkOf(svg)}</svg>`).getBBox()!
  const [, viewTop, viewWidth, viewHeight] = svg.props.viewBox!.split(' ').map(Number)
  const scale = Math.min(svg.props.width! / viewWidth!, svg.props.height! / viewHeight!)
  const centreInSvg = (svg.props.height! - viewHeight! * scale) / 2 + (bounds.y + bounds.height / 2 - viewTop!) * scale
  const layout = measureProfileRow(measurable(owner), width, 1)
  const box = layout.boxes.find((candidate) => candidate.testID === svg.props.testID)!
  return box.top + centreInSvg - layout.height / 2
}

it.each([390, 1280].flatMap((width) => [en, ptBR].map((messages) => ({ width, messages }))))(
  'centres the drawn Orbit in the composer entry and in the Today line at $width in both locales', async ({ width, messages }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let tree!: Tree
    await act(() => { tree = create(<>
      <Composer state="idle" value="" onChangeValue={vi.fn()} onSend={vi.fn()} words={messages.shell.composer} suggestions={[]}
        onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />
      <TodayAstraLine text={messages.todayAstra.openConversation} destination={messages.chat.title} onPress={vi.fn()} />
    </>) as Tree })
    try {
      const rendered = tree.toJSON()
      const hosts = (Array.isArray(rendered) ? rendered : [rendered]).flatMap(descendants)
      const owners = [
        hosts.find((host) => host.type === 'Pressable' && host.props.accessibilityLabel === messages.todayAstra.openConversation),
        hosts.find((host) => host.props.testID === 'today-astra-slot'),
      ]
      for (const owner of owners) {
        expect(owner).toBeDefined()
        expect.soft(Math.abs(drawnOffset(owner!, width))).toBeLessThanOrEqual(1)
      }
    } finally { await act(() => tree.unmount()) }
  },
)
