import { describe, expect, it } from 'vitest'
import {
  INITIAL_DISMISS_GUARD_LIFECYCLE,
  resolveDismissGuardAction,
  type DismissGuardAction,
  type DismissGuardLifecycle,
} from '../hooks/dismiss-guard-core'

const editing: DismissGuardLifecycle = { showDiscardDialog: false, cancelling: false, pendingDismiss: false }
const confirming: DismissGuardLifecycle = { showDiscardDialog: true, cancelling: false, pendingDismiss: false }
const cancelling: DismissGuardLifecycle = { showDiscardDialog: false, cancelling: true, pendingDismiss: false }
const queued: DismissGuardLifecycle = { showDiscardDialog: false, cancelling: true, pendingDismiss: true }

const transitions: {
  name: string
  lifecycle: DismissGuardLifecycle
  action: DismissGuardAction
  isDirty: boolean
  next: DismissGuardLifecycle
  shouldDismiss: boolean
}[] = [
  { name: 'clean editing request', lifecycle: editing, action: 'request', isDirty: false, next: editing, shouldDismiss: true },
  { name: 'dirty editing request', lifecycle: editing, action: 'request', isDirty: true, next: confirming, shouldDismiss: false },
  { name: 'clean confirming request', lifecycle: confirming, action: 'request', isDirty: false, next: editing, shouldDismiss: true },
  { name: 'dirty confirming request', lifecycle: confirming, action: 'request', isDirty: true, next: confirming, shouldDismiss: false },
  { name: 'clean cancelling request', lifecycle: cancelling, action: 'request', isDirty: false, next: queued, shouldDismiss: false },
  { name: 'dirty cancelling request', lifecycle: cancelling, action: 'request', isDirty: true, next: queued, shouldDismiss: false },
  { name: 'clean queued request', lifecycle: queued, action: 'request', isDirty: false, next: queued, shouldDismiss: false },
  { name: 'dirty queued request', lifecycle: queued, action: 'request', isDirty: true, next: queued, shouldDismiss: false },
]

const lifecycles = [editing, confirming, cancelling, queued]
for (const [index, lifecycle] of lifecycles.entries()) {
  for (const isDirty of [false, true]) {
    transitions.push(
      { name: `confirm state ${index}, dirty ${isDirty}`, lifecycle, action: 'confirm', isDirty, next: editing, shouldDismiss: true },
      { name: `begin cancel state ${index}, dirty ${isDirty}`, lifecycle, action: 'begin-cancel', isDirty, next: cancelling, shouldDismiss: false },
      { name: `complete cancel state ${index}, dirty ${isDirty}`, lifecycle, action: 'complete-cancel', isDirty, next: lifecycle === queued ? confirming : editing, shouldDismiss: false },
    )
  }
}

describe('resolveDismissGuardAction', () => {
  it.each(transitions)('$name', ({ lifecycle, action, isDirty, next, shouldDismiss }) => {
    const snapshot = { ...lifecycle }

    expect(resolveDismissGuardAction(action, isDirty, Object.freeze({ ...lifecycle }))).toEqual({
      lifecycle: next,
      shouldDismiss,
    })
    expect(lifecycle).toEqual(snapshot)
    expect(INITIAL_DISMISS_GUARD_LIFECYCLE).toEqual(editing)
  })

  it('queues a request during cancellation instead of dismissing a clean form', () => {
    const decision = resolveDismissGuardAction('request', false, cancelling)

    expect(decision.shouldDismiss).toBe(false)
    expect(decision.lifecycle).toEqual(queued)
  })

  it('handles Back during closing and after a completed Keep editing close', () => {
    let lifecycle = INITIAL_DISMISS_GUARD_LIFECYCLE
    const actions: DismissGuardAction[] = [
      'request', 'begin-cancel', 'request', 'request', 'complete-cancel',
      'begin-cancel', 'complete-cancel', 'request', 'confirm',
    ]
    const expected = [confirming, cancelling, queued, queued, confirming, cancelling, editing, confirming, editing]
    let dismissals = 0

    actions.forEach((action, index) => {
      const decision = resolveDismissGuardAction(action, true, lifecycle)
      lifecycle = decision.lifecycle
      if (decision.shouldDismiss) dismissals += 1
      expect(lifecycle).toEqual(expected[index])
      expect(dismissals).toBe(action === 'confirm' ? 1 : 0)
    })
  })
})
