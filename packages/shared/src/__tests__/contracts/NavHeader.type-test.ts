import type { NavHeaderProps } from '../../contracts/navigation'

type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof NavHeaderProps, 'title' | 'onBack' | 'backLabel' | 'action'>
export type ExpectedKeys = AssertKeys<'title' | 'onBack' | 'backLabel' | 'action', keyof NavHeaderProps>
export const valid: NavHeaderProps = { title: 'Settings' }
// @ts-expect-error forbidden contract shape
export const forbidden0: NavHeaderProps = { title: 'Settings', onBack: () => {} }
// @ts-expect-error forbidden contract shape
export const forbidden1: NavHeaderProps = { title: 'Settings', backLabel: 'Profile' }
// @ts-expect-error forbidden contract shape
export const forbidden2: NavHeaderProps = { onBack: () => {}, backLabel: 'Profile' }
