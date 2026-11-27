import { createElement, useCallback, useEffect, useId, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOptionReasons, distinctOptionReasons, setOptionReason, type ReportOptionReason } from '../hooks/option-reasons-core'

const { useReportedReason, useOptionReasons } = createOptionReasons({ useCallback, useEffect, useId, useState })
let tree: ReactTestRenderer | undefined

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => {
  void act(() => tree?.unmount())
  tree = undefined
  vi.unstubAllGlobals()
})

describe('setOptionReason', () => {
  it('adds a reason, replaces it and removes it', () => {
    const one = setOptionReason(new Map(), 'a', 'Wait')
    expect([...one]).toEqual([['a', 'Wait']])
    expect([...setOptionReason(one, 'a', 'Stop')]).toEqual([['a', 'Stop']])
    expect(setOptionReason(one, 'a', null).size).toBe(0)
  })

  it('returns the same map when nothing changes', () => {
    const one = setOptionReason(new Map(), 'a', 'Wait')
    expect(setOptionReason(one, 'a', 'Wait')).toBe(one)
    expect(setOptionReason(one, 'b', null)).toBe(one)
  })
})

describe('distinctOptionReasons', () => {
  it('lists each different reason once in order', () => {
    const reasons = new Map([['a', 'Wait'], ['b', 'Stop'], ['c', 'Wait']])
    expect(distinctOptionReasons(reasons)).toEqual(['Wait', 'Stop'])
  })
})

describe('the reason channel', () => {
  it('shows one reason of two options once, and drops it when the options stop reporting', () => {
    let shown: string[] = []
    let report: ReportOptionReason | null = null
    function Group({ reason }: { reason: string | null }) {
      const group = useOptionReasons()
      shown = group.shown
      report = group.report
      useReportedReason(group.report, reason)
      useReportedReason(group.report, reason)
      return null
    }
    void act(() => { tree = create(createElement(Group, { reason: 'Clear the list first' })) })
    expect(shown).toEqual(['Clear the list first'])
    expect(report).not.toBeNull()
    void act(() => tree!.update(createElement(Group, { reason: null })))
    expect(shown).toEqual([])
  })

  it('reports that no group exists when the report is null', () => {
    let inGroup: boolean | undefined
    function Alone() {
      inGroup = useReportedReason(null, 'Wait')
      return null
    }
    void act(() => { tree = create(createElement(Alone)) })
    expect(inGroup).toBe(false)
  })
})
