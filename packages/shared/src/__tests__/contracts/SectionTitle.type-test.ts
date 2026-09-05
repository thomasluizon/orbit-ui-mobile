import type { SectionTitleProps } from '../../contracts/navigation'
import type { ReactNode } from 'react'
declare const node: ReactNode
type AssertKeys<TActual extends TExpected, TExpected> = TActual

export type ActualKeys = AssertKeys<keyof SectionTitleProps, 'children' | 'eyebrow'>
export type ExpectedKeys = AssertKeys<'children' | 'eyebrow', keyof SectionTitleProps>
export const valid: SectionTitleProps = { children: 'Habits', eyebrow: 'Today' }
// @ts-expect-error forbidden contract shape
export const forbidden0: SectionTitleProps = { children: 'Habits', subtitle: 'More' }
// @ts-expect-error forbidden contract shape
export const forbidden1: SectionTitleProps = { children: 'Habits', top: 4 }
// @ts-expect-error forbidden contract shape
export const forbidden2: SectionTitleProps = { children: 'Habits', bottom: 4 }
// @ts-expect-error forbidden contract shape
export const forbidden3: SectionTitleProps = { children: 'Habits', inset: false }
// @ts-expect-error forbidden contract shape
export const forbidden4: SectionTitleProps = { children: 'Habits', trailing: 'Control' }
// @ts-expect-error forbidden contract shape
export const forbidden5: SectionTitleProps = { children: 'Habits', eyebrow: node }
