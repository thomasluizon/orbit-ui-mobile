import { createElement, useEffect, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUsePlanAnnouncement } from '../hooks'
import type { StateHook } from '../hooks/state-adapter'
import en from '../i18n/en.json'
import pt from '../i18n/pt-BR.json'
import { makeAstraPlan } from '../test-support/astra-plan-fixtures'
import type { ChatMessage } from '../types/chat'

const unmounts: (() => void)[] = []

function mountAnnouncement(messages: readonly ChatMessage[], runningLabel: string, stateHook: StateHook = useState) {
  const usePlanAnnouncement = createUsePlanAnnouncement({ useState: stateHook, useEffect })
  let announcement = ''
  function AnnouncementProbe(props: { messages: readonly ChatMessage[] }) {
    announcement = usePlanAnnouncement(props.messages, runningLabel)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(AnnouncementProbe, { messages })) })
  const unmount = () => { void act(() => tree.unmount()) }
  unmounts.push(unmount)
  return {
    get current() { return announcement },
    update: (nextMessages: readonly ChatMessage[]) => {
      void act(() => tree.update(createElement(AnnouncementProbe, { messages: nextMessages })))
    },
    unmount,
  }
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  vi.unstubAllGlobals()
})

describe.each(['en', 'pt-BR'])('shared plan announcements in %s', locale => {
  const runningLabel = (locale === 'en' ? en : pt).blockFrame.status.acting
  function runningMessage(): ChatMessage {
    const plan = makeAstraPlan(locale)
    return { id: 'reply', role: 'ai', content: '', timestamp: new Date(), plan: {
      ...plan, steps: [{ ...plan.steps[0]!, status: 'running' }, plan.steps[1]!],
    } }
  }

  it('announces the first running step after the microtask', async () => {
    const message = runningMessage()
    const announcement = mountAnnouncement([message], runningLabel)
    expect(announcement.current).toBe('')
    await act(async () => { await Promise.resolve() })
    expect(announcement.current).toBe(`${message.plan!.steps[0]!.text}: ${runningLabel}`)
  })

  it('does not repeat a running step when its text changes', async () => {
    const message = runningMessage()
    const announcement = mountAnnouncement([message], runningLabel)
    await act(async () => { await Promise.resolve() })
    const first = announcement.current
    announcement.update([{ ...message, plan: { ...message.plan!, steps: message.plan!.steps.map(step => ({ ...step, text: `${step.text}...` })) } }])
    await act(async () => { await Promise.resolve() })
    expect(announcement.current).toBe(first)
  })

  it('announces a new running step without repeating earlier work', async () => {
    const message = runningMessage()
    const announcement = mountAnnouncement([message], runningLabel)
    await act(async () => { await Promise.resolve() })
    announcement.update([{ ...message, plan: { ...message.plan!, steps: message.plan!.steps.map(step => ({ ...step, status: 'running' })) } }])
    await act(async () => { await Promise.resolve() })
    expect(announcement.current).toBe(`${message.plan!.steps[1]!.text}: ${runningLabel}`)
  })

  it('sets no state after unmounting before the microtask', async () => {
    const updated = vi.fn()
    const trackedState: StateHook = initial => {
      const [value, update] = useState(initial)
      return [value, next => { updated(); update(next) }]
    }
    const announcement = mountAnnouncement([runningMessage()], runningLabel, trackedState)
    announcement.unmount()
    await act(async () => { await Promise.resolve() })
    expect(updated).not.toHaveBeenCalled()
    expect(announcement.current).toBe('')
  })

  it('discards a superseded effect before it consumes a running step', async () => {
    const message = runningMessage()
    const announcement = mountAnnouncement([message], runningLabel)
    announcement.update([])
    await act(async () => { await Promise.resolve() })
    expect(announcement.current).toBe('')
    announcement.update([message])
    await act(async () => { await Promise.resolve() })
    expect(announcement.current).toBe(`${message.plan!.steps[0]!.text}: ${runningLabel}`)
  })
})
