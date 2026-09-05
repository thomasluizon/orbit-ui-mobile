import type { PagerProps } from '../../contracts/navigation'

type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof PagerProps, 'index' | 'count' | 'label' | 'backLabel' | 'onBack' | 'forwardLabel' | 'onForward' | 'forwardSlot'>
export type ExpectedKeys = AssertKeys<'index' | 'count' | 'label' | 'backLabel' | 'onBack' | 'forwardLabel' | 'onForward' | 'forwardSlot', keyof PagerProps>
export const valid: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue' }
// @ts-expect-error forbidden contract shape
export const forbidden0: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue', forwardSlot: 'Done' }
// @ts-expect-error forbidden contract shape
export const forbidden1: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardSlot: 'Done', onForward: () => {} }
// @ts-expect-error forbidden contract shape
export const forbidden2: PagerProps = { count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue' }
// @ts-expect-error forbidden contract shape
export const forbidden3: PagerProps = { index: 0, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue' }
// @ts-expect-error forbidden contract shape
export const forbidden4: PagerProps = { index: 0, count: 5, backLabel: 'Previous', forwardLabel: 'Continue' }
// @ts-expect-error forbidden contract shape
export const forbidden5: PagerProps = { index: 0, count: 5, label: 'Steps', forwardLabel: 'Continue' }
// @ts-expect-error forbidden contract shape
export const forbidden6: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous' }
// @ts-expect-error forbidden contract shape
export const forbidden7: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue', duration: true }
// @ts-expect-error forbidden contract shape
export const forbidden8: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue', autoAdvance: true }
// @ts-expect-error forbidden contract shape
export const forbidden9: PagerProps = { index: 0, count: 5, label: 'Steps', backLabel: 'Previous', forwardLabel: 'Continue', isValid: true }
