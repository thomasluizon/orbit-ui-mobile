import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { act, create } from 'react-test-renderer'
import { vi } from 'vitest'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm, type GuidedHabitFlowHelpers, type GuidedHabitFlowOptions } from '../hooks/guided-habit-flow-core'
import { applyHabitFormMode, HabitModeDrafts } from '../utils/habit-form-state'

const useGuidedHabitFlow = createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef })

type Values = Record<string, unknown> & ReturnType<GuidedHabitFlowForm['getValues']> & { reminderEnabled: boolean }

/**
 * A guided flow over a form that switches mode the way the real form hooks do: each switch keeps the fields of the mode it leaves
 * and restores the fields of the mode it enters, through the real `HabitModeDrafts`. The flow tests need it to see what a switch wipes.
 */
export interface ModeFlow { values: Values; flow: ReturnType<typeof useGuidedHabitFlow>; unmount: () => void }

export function mountModeFlow(readPhrase: GuidedHabitFlowOptions['readPhrase'] = async () => null, mode: 'create' | 'edit' = 'create'): ModeFlow {
  const values = {
    title: '', dueDate: '', dueTime: '', dueEndTime: '', frequencyUnit: undefined, frequencyQuantity: undefined, isFlexible: false, isGeneral: false, itemType: 'task', emoji: '',
    days: [], monthDays: [], intervalWeeks: 1, datePhrase: '', dateIssue: '', endDate: '', repeatReminder: null, reminderEnabled: false, scheduledReminders: [], isBadHabit: false, slipAlertEnabled: false,
  } as unknown as Values
  let render = () => {}
  const write = (change: Record<string, unknown>) => { Object.assign(values, change); render() }
  const drafts = new HabitModeDrafts()
  const switchTo = (next: 'oneTime' | 'recurring' | 'flexible' | 'general') => {
    const draft = drafts.switch(values as never, next)
    if (draft) write(draft)
  }
  const form: GuidedHabitFlowForm = { getValues: () => values, setField: (field, value) => write({ [field]: value }) }
  const setOneTime = () => { switchTo('oneTime'); write({ isGeneral: false, isFlexible: false, frequencyUnit: undefined, frequencyQuantity: undefined, days: [], endDate: '' }) }
  const setRecurring = () => { switchTo('recurring'); write({ isGeneral: false, isFlexible: false, frequencyUnit: values.frequencyUnit ?? 'Day', frequencyQuantity: values.frequencyQuantity || 1 }) }
  const setFlexible = () => { switchTo('flexible'); write({ isGeneral: false, isFlexible: true, days: [], frequencyUnit: values.frequencyUnit ?? 'Week', frequencyQuantity: values.frequencyQuantity || 3 }) }
  const setGeneral = () => {
    const draft = drafts.switch(values as never, 'general')
    const keepReminder = Boolean(values.repeatReminder)
    write({ isGeneral: true, isFlexible: false, isBadHabit: false, frequencyUnit: undefined, frequencyQuantity: undefined, days: [], dueTime: '', dueEndTime: '', endDate: '', scheduledReminders: [], ...(keepReminder ? {} : { reminderEnabled: false }) })
    if (draft) write(draft)
    write({ dueDate: '', datePhrase: '', dateIssue: '' })
  }
  const chooseItemType = (itemType: 'task' | 'habit') => {
    applyHabitFormMode(itemType === 'task' ? drafts.taskMode : drafts.habitMode, { setOneTime, setRecurring, setFlexible, setGeneral })
    write({ itemType })
  }
  const helpers: GuidedHabitFlowHelpers = {
    get isGeneral() { return values.isGeneral === true },
    toggleDay: vi.fn(), chooseItemType, setOneTime, setRecurring, setFlexible, setGeneral, backendFocusRequest: 0, backendFocusField: undefined,
  }
  const applySchedule: GuidedHabitFlowOptions['applySchedule'] = () => true
  let flow!: ReturnType<typeof useGuidedHabitFlow>
  function FlowProbe() {
    const [, setVersion] = useState(0)
    render = () => setVersion((version) => version + 1)
    flow = useGuidedHabitFlow({
      mode, lockedGeneral: null, locale: 'en', timeZone: 'UTC', isOnline: true, helpers, form, readPhrase, applySchedule,
      watched: { title: values.title, itemType: values.itemType, dueDate: values.dueDate, dueTime: values.dueTime, frequencyUnit: values.frequencyUnit, isFlexible: values.isFlexible },
    })
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(FlowProbe)) })
  return { values, get flow() { return flow }, unmount: () => { void act(() => tree.unmount()) } }
}
