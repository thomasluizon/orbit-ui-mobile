import type { ReactNode } from 'react'
import type { StepUpProps } from './StepUp'

type Accepts<
  Actual extends Expected & Record<Exclude<keyof Actual, keyof Expected>, never>,
  Expected,
> = Actual

type ValidStepUp = Accepts<{
  message: 'Sign in again.'
  actionLabel: 'Sign in'
  onAction: () => void
}, StepUpProps>

// @ts-expect-error message is required
type NoMessage = Accepts<{ actionLabel: 'Sign in'; onAction: () => void }, StepUpProps>

// @ts-expect-error actionLabel is required
type NoActionLabel = Accepts<{ message: 'Sign in again.'; onAction: () => void }, StepUpProps>

// @ts-expect-error onAction is required
type NoAction = Accepts<{ message: 'Sign in again.'; actionLabel: 'Sign in' }, StepUpProps>

// @ts-expect-error StepUp has no child slot
type Child = Accepts<{
  message: 'Sign in again.'
  actionLabel: 'Sign in'
  onAction: () => void
  children: ReactNode
}, StepUpProps>

// @ts-expect-error StepUp has no disabled state
type DisabledStepUp = Accepts<{
  message: 'Sign in again.'
  actionLabel: 'Sign in'
  onAction: () => void
  disabled: true
}, StepUpProps>

// @ts-expect-error errors belong to the sign-in surface
type ErrorStepUp = Accepts<{
  message: 'Sign in again.'
  actionLabel: 'Sign in'
  onAction: () => void
  error: 'No'
}, StepUpProps>

// @ts-expect-error node values cannot pass through the message prop
type NodeMessage = Accepts<{
  message: ReactNode
  actionLabel: 'Sign in'
  onAction: () => void
}, StepUpProps>

export type StepUpTypeAssertions =
  | ValidStepUp
  | NoMessage
  | NoActionLabel
  | NoAction
  | Child
  | DisabledStepUp
  | ErrorStepUp
  | NodeMessage
