import type { ReactElement } from 'react'
import { act, create } from 'react-test-renderer'
import { Animated } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Columns } from '@/components/ui/columns'
import { Fab } from '@/components/ui/fab'
import { Icon } from '@/components/ui/icon'
import { Lockup } from '@/components/ui/lockup'
import { ProgressRing } from '@/components/ui/progress-ring'
import { createTokensV2 } from '@/lib/theme'

const tokens = createTokensV2('purple', 'dark')
const motionState = vi.hoisted(() => ({ reduced: false }))

vi.mock('@/lib/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/motion')>()),
  usePrefersReducedMotion: () => motionState.reduced,
}))

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  find(predicate: (node: TestNode) => boolean): TestNode
  findByProps(props: Readonly<Record<string, unknown>>): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: string): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
}

type StyleArray = readonly [Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>]

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  if (tree == null) throw new Error('Primitive test renderer did not mount')
  return tree
}

function prop<T>(node: TestNode, name: string): T {
  return node.props[name] as T
}

function byType(root: TestNode, type: string): TestNode[] {
  return root.findAll((node) => node.type === type)
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (typeof style === 'function') return flattenStyle(style({ pressed: true }))
  if (Array.isArray(style)) return style.reduce<Record<string, unknown>>((merged, entry) => ({ ...merged, ...flattenStyle(entry) }), {})
  return style !== null && typeof style === 'object' ? style as Record<string, unknown> : {}
}

describe('redesign primitives on mobile', () => {
  beforeEach(() => {
    motionState.reduced = false
    vi.restoreAllMocks()
  })

  it('renders a measured zero as a 2px column without using the empty words', () => {
    const tree = render(
      <Columns
        columns={[
          { id: 'zero', label: 'Zero', value: 0 },
          { id: 'ten', label: 'Ten', value: 10 },
        ]}
        label="Results"
        emptyLabel="No measurements"
      />,
    )
    expect(prop(tree.root.findAllByType('View')[0]!, 'accessible')).toBe(false)
    const zero = tree.root.find((node) => prop(node, 'accessibilityLabel') === 'Results. Zero: 0')
    expect(prop(zero, 'accessible')).toBe(true)
    expect(prop(zero, 'accessibilityRole')).toBe('image')
    const fill = zero.findAllByType('View').find((node) => {
      const style = prop<StyleArray | undefined>(node, 'style')
      return style?.[1]?.height === 2
    })
    expect(prop<StyleArray>(fill!, 'style')[1].height).toBe(2)
  })

  it('uses the tallest column or a supplied shared maximum as its scale', () => {
    const tree = render(
      <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} emptyLabel="Empty" />,
    )
    const findFill = () => tree.root.findAllByType('View').find((node) => {
      const style = prop<StyleArray | undefined>(node, 'style')
      return style?.[0]?.maxWidth === 48
    })
    expect(prop<StyleArray>(findFill()!, 'style')[1].height).toBe('100%')

    void act(() => {
      tree.update(
        <Columns columns={[{ id: 'one', label: 'One', value: 10 }]} max={20} emptyLabel="Empty" />,
      )
    })
    expect(prop<StyleArray>(findFill()!, 'style')[1].height).toBe('50%')
  })

  it('keeps the measured ring static on mount and interrupts later progress changes', () => {
    const animations: {
      reset: ReturnType<typeof vi.fn>
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
    }[] = []
    const timing = vi.spyOn(Animated, 'timing').mockImplementation(() => {
      const animation = { reset: vi.fn(), start: vi.fn(), stop: vi.fn() }
      animations.push(animation)
      return animation
    })
    const tree = render(<ProgressRing value={0} label="Progress" />)
    const progressCircle = () => byType(tree.root, 'Circle')[1]!
    const circumference = 2 * Math.PI * 30

    void act(() => {
      prop<() => void>(byType(tree.root, 'Svg')[0]!, 'onLayout')()
    })

    expect(prop(byType(tree.root, 'Circle')[0]!, 'stroke')).toBe(tokens.trackEmpty)
    expect(prop(progressCircle(), 'opacity')).toBe(0)
    expect(timing).not.toHaveBeenCalled()

    void act(() => {
      tree.update(<ProgressRing value={40} label="Progress" />)
    })
    expect(prop(progressCircle(), 'opacity')).toBe(1)
    expect(prop(progressCircle(), 'stroke')).toBe(tokens.primary)
    expect(timing).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: circumference * 0.6 }),
    )

    void act(() => {
      tree.update(<ProgressRing value={70} label="Progress" />)
    })
    expect(animations[0]?.stop).toHaveBeenCalledOnce()

    motionState.reduced = true
    void act(() => {
      tree.update(<ProgressRing value={99.9} label="Progress" />)
    })
    expect(timing).toHaveBeenCalledTimes(2)
    expect(prop<{ value: number }>(progressCircle(), 'strokeDashoffset').value).toBeCloseTo(circumference * 0.001)

    void act(() => {
      tree.update(<ProgressRing value={100} label="Progress" />)
    })
    expect(tree.root.findByProps({ testID: 'progress-ring-complete' })).toBeDefined()
    expect(prop(byType(tree.root, 'Circle')[1]!, 'stroke')).toBe(tokens.fg3)
  })

  it('keeps the FAB labelled and actionable', () => {
    const onClick = vi.fn()
    const tree = render(<Fab label="Create" onClick={onClick}>+</Fab>)
    const button = tree.root.findByProps({ testID: 'fab' })
    expect(prop(button, 'accessibilityLabel')).toBe('Create')
    prop<() => void>(button, 'onPress')()
    expect(onClick).toHaveBeenCalledOnce()
  })

  describe('FAB press feedback', () => {
    function pressedFab(element: ReactElement) {
      const tree = render(element)
      const host = () => tree.root.findAll(node => node.type === 'Pressable' && node.props.testID === 'fab').at(-1)!
      void act(() => { prop<() => void>(host(), 'onPressIn')() })
      const style = flattenStyle(prop<unknown>(host(), 'style'))
      return { tree, style }
    }

    it('scales the FAB to 0.96 with the pressed fill and clips it to the circle', () => {
      const { tree, style } = pressedFab(<Fab label="Create">+</Fab>)
      expect(style.transform).toEqual([{ scale: 0.96 }])
      expect(style.backgroundColor).toBe(tokens.primaryPressed)
      expect(style.borderRadius).toBe(999)
      expect(style.overflow).toBe('hidden')
      expect(tree.root.findAll(node => node.props.testID === 'fab-press-fill')).toHaveLength(0)
    })

    it('presses the primary FAB to the pressed fill without a scale under reduced motion', () => {
      motionState.reduced = true
      const { style } = pressedFab(<Fab label="Create">+</Fab>)
      expect(style.backgroundColor).toBe(tokens.primaryPressed)
      expect(style.transform).toEqual([{ scale: 1 }])
    })
  })

  it.each([16, 20, 24] as const)('draws the small static face at %ipx with the moon as the only accent', (size) => {
    const tree = render(<OrbitMascot size={size} />)
    const mascot = tree.root.findByProps({ testID: 'orbit-mascot' })
    expect(mascot.props).toMatchObject({ width: size, height: size * 0.75, accessible: false, color: tokens.fg1, 'data-orbit-face': 'small', 'data-orbit-loop': 'still' })
    const paths = byType(tree.root, 'Path')
    expect(paths.filter(path => prop(path, 'fill') === tokens.primary)).toHaveLength(1)
    expect(paths.filter(path => prop(path, 'fill') === tokens.bg).length).toBeGreaterThanOrEqual(3)
  })

  it.each([48, 96, 128] as const)('draws the live rig at %ipx in the 7 by 5 box', (size) => {
    const tree = render(<OrbitMascot size={size} still />)
    expect(tree.root.findByProps({ testID: 'orbit-mascot' }).props).toMatchObject({ width: size, height: (size * 300) / 420, viewBox: '-210 -150 420 300', 'data-orbit-face': 'rig', 'data-orbit-state': 'parado' })
    expect((22 / 420) * size).toBeGreaterThanOrEqual(2)
    const accent = [...byType(tree.root, 'Path'), ...byType(tree.root, 'Circle')].filter(node => prop(node, 'fill') === tokens.primary)
    expect(accent).toHaveLength(1)
  })

  it.each(['parado', 'pensando', 'feliz', 'descansando'] as const)('exposes the %s state', (state) => {
    const tree = render(<OrbitMascot size={96} state={state} still />)
    expect(tree.root.findByProps({ testID: 'orbit-mascot' }).props['data-orbit-state']).toBe(state)
    const arcs = byType(tree.root, 'Path').filter(path => prop(path, 'strokeWidth') === 17)
    expect(arcs).toHaveLength(state === 'feliz' ? 2 : 0)
  })

  it('honours the color of the planet and the ring', () => {
    const tree = render(<OrbitMascot size={16} color="#123456" />)
    expect(prop(tree.root.findByProps({ testID: 'orbit-mascot' }), 'color')).toBe('#123456')
  })

  it('centres icons at the default size and makes accessibility deliberate', () => {
    const tree = render(<Icon name="home" />)
    const decorative = tree.root.findByProps({ testID: 'icon-home' })
    expect(prop(decorative, 'accessibilityElementsHidden')).toBe(true)
    expect(prop(decorative, 'style')).toMatchObject({ height: 24, width: 24 })

    void act(() => {
      tree.update(<Icon name="home" label="Home" />)
    })
    expect(prop(tree.root.findByProps({ testID: 'icon-home' }), 'accessibilityLabel')).toBe('Home')
  })

  it('renders the outlined lockup with fixed geometry and no text node', () => {
    const tree = render(<Lockup />)
    const lockup = tree.root.findByProps({ testID: 'orbit-lockup' })
    expect(prop(lockup, 'viewBox')).toBe('-0.000400046 0.000000000 89.395902732 17.742772815')
    expect(byType(tree.root, 'Path')).toHaveLength(5)
    expect(byType(tree.root, 'Text')).toHaveLength(0)
  })
})
