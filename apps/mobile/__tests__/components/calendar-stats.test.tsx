import React from 'react'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'
import { describe, expect, it } from 'vitest'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'

const TestRenderer = require('react-test-renderer')
type LayoutStyle = ViewStyle & TextStyle
type TestInstance = import('react-test-renderer').ReactTestInstance
type TestInstanceWithChildren = TestInstance & {
  children: (TestInstance | string)[]
}

function measureChildHeight(node: TestInstance): number {
  const style = StyleSheet.flatten(node.props.style) as LayoutStyle | undefined
  return Math.max(Number(style?.height ?? 0), Number(style?.minHeight ?? 0), Number(style?.lineHeight ?? 0))
}

function hasChildren(node: TestInstance): node is TestInstanceWithChildren {
  return 'children' in node && Array.isArray(node.children)
}

function measureTileHeight(node: TestInstance): number {
  const style = StyleSheet.flatten(node.props.style) as LayoutStyle
  if (!hasChildren(node)) throw new TypeError('ReactTestInstance must expose its rendered children')
  const children = node.children.filter(
    (child): child is TestInstance => typeof child !== 'string',
  )
  const padding = Number(style.paddingVertical ?? style.padding ?? 0) * 2
  const gaps = Number(style.gap ?? 0) * Math.max(0, children.length - 1)
  const content = children.reduce((height, child) => height + measureChildHeight(child), 0)
  return Math.max(Number(style.minHeight ?? 0), padding + gaps + content)
}

const stats = [
  { key: 'bestStreak', emoji: '🔥', value: 0, label: 'Best streak' },
  { key: 'totalLogs', emoji: '✅', value: 0, label: 'Total logs' },
  { key: 'missed', emoji: '⚠️', value: 0, label: 'Missed' },
] as const

describe('CalendarStats (mobile)', () => {
  it('uses each tile own loading state', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarStats stats={stats} state="loading" loadingLabel="Loading" />,
      )
    })

    expect(tree.root.findAll((node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityRole === 'progressbar' &&
      node.props.accessibilityLabel === 'Loading',
    )).toHaveLength(3)
    expect(tree.root.findAll((node) => node.props.children === 0)).toHaveLength(0)
  })

  it('keeps every pending tile at its loaded height', () => {
    let loadedTree!: import('react-test-renderer').ReactTestRenderer
    let pendingTree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      loadedTree = TestRenderer.create(<CalendarStats stats={stats} />)
      pendingTree = TestRenderer.create(
        <CalendarStats stats={stats} state="loading" loadingLabel="Loading" />,
      )
    })

    const loadedHeights = loadedTree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'stat-tile-default',
    )
      .map(measureTileHeight)
    const pendingHeights = pendingTree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'stat-tile-loading',
    )
      .map(measureTileHeight)

    expect(loadedHeights).toHaveLength(3)
    expect(pendingHeights).toEqual(loadedHeights)
  })

  it('states no data instead of zero for an empty month', () => {
    let tree!: import('react-test-renderer').ReactTestRenderer
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarStats stats={stats} state="empty" emptyLabel="no data" />,
      )
    })

    expect(tree.root.findAll((node) =>
      typeof node.type === 'string' && node.props.children === 'no data',
    )).toHaveLength(3)
    expect(tree.root.findAll((node) => node.props.children === 0)).toHaveLength(0)
  })
})
