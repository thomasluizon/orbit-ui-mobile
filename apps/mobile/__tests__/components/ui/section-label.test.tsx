import React from 'react'
import { describe, expect, it } from 'vitest'

import { SectionLabel } from '@/components/ui/section-label'

const TestRenderer = require('react-test-renderer')

function renderLabel(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function headingStyle(tree: any) {
  return tree.root
    .findAllByType('Text')
    .find((node: any) => node.props.accessibilityRole === 'header').props.style
}

describe('SectionLabel (mobile)', () => {
  it('marks the label as a heading for screen readers', () => {
    const tree = renderLabel(<SectionLabel>Hábitos</SectionLabel>)
    const headings = tree.root
      .findAllByType('Text')
      .filter((node: any) => node.props.accessibilityRole === 'header')
    expect(headings).toHaveLength(1)
    expect(headings[0].props.children).toBe('Hábitos')
  })

  it('scales the heading with the level contract', () => {
    const section = headingStyle(renderLabel(<SectionLabel>Metas</SectionLabel>))
    const page = headingStyle(renderLabel(<SectionLabel level="page">Metas</SectionLabel>))
    const sub = headingStyle(renderLabel(<SectionLabel level="sub">Metas</SectionLabel>))

    expect(page.fontSize).toBeGreaterThan(section.fontSize)
    expect(section.fontSize).toBeGreaterThan(sub.fontSize)
    expect(sub.textTransform).toBe('uppercase')
  })

  it('renders a supporting description and a trailing slot', () => {
    const tree = renderLabel(
      <SectionLabel description="Acompanhe seu progresso" trailing={React.createElement('Tr')}>
        Metas
      </SectionLabel>,
    )
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['Metas', 'Acompanhe seu progresso']))
    expect(tree.root.findAllByType('Tr')).toHaveLength(1)
  })
})
