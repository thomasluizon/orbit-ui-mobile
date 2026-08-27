import type { StepUpProps } from './StepUp'

export function stepUpTypeTests(): void {
  const valid: StepUpProps = { message: 'Sign in again.', actionLabel: 'Sign in', onAction: () => {} }
  // @ts-expect-error message is required
  const noMessage: StepUpProps = { actionLabel: 'Sign in', onAction: () => {} }
  // @ts-expect-error actionLabel is required
  const noActionLabel: StepUpProps = { message: 'Sign in again.', onAction: () => {} }
  // @ts-expect-error onAction is required
  const noAction: StepUpProps = { message: 'Sign in again.', actionLabel: 'Sign in' }
  // @ts-expect-error StepUp has no child slot
  const child: StepUpProps = { message: 'Sign in again.', actionLabel: 'Sign in', onAction: () => {}, children: 'field' }
  // @ts-expect-error StepUp has no disabled state
  const disabled: StepUpProps = { message: 'Sign in again.', actionLabel: 'Sign in', onAction: () => {}, disabled: true }
  // @ts-expect-error errors belong to the sign-in surface
  const error: StepUpProps = { message: 'Sign in again.', actionLabel: 'Sign in', onAction: () => {}, error: 'No' }
  void [valid, noMessage, noActionLabel, noAction, child, disabled, error]
}
