import type { ReactElement } from 'react'
import type { SectionTitleProps } from './SectionTitle'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

export type SectionTitleTypeContract = [
  Assert<IsExact<{ children: 'Habits' }, SectionTitleProps>>,
  Assert<IsExact<{ children: 'Habits'; eyebrow: 'Today' }, SectionTitleProps>>,
  Assert<IsExact<{ children: ReactElement }, SectionTitleProps>>,
  Assert<Exclude<Keys<SectionTitleProps>, 'children' | 'eyebrow'> extends never ? true : false>,
  Assert<Exclude<'children' | 'eyebrow', Keys<SectionTitleProps>> extends never ? true : false>,
  // @ts-expect-error section titles have no subtitle
  Assert<IsExact<{ children: 'Habits'; subtitle: 'Your habits' }, SectionTitleProps>>,
  // @ts-expect-error trailing controls belong to the section content
  Assert<IsExact<{ children: 'Habits'; trailing: 'Edit' }, SectionTitleProps>>,
  // @ts-expect-error top spacing belongs to the primitive
  Assert<IsExact<{ children: 'Habits'; top: 16 }, SectionTitleProps>>,
  // @ts-expect-error bottom spacing belongs to the primitive
  Assert<IsExact<{ children: 'Habits'; bottom: 16 }, SectionTitleProps>>,
  // @ts-expect-error inset spacing belongs to the primitive
  Assert<IsExact<{ children: 'Habits'; inset: 16 }, SectionTitleProps>>,
  // @ts-expect-error eyebrows carry words rather than nodes
  Assert<IsExact<{ children: 'Habits'; eyebrow: ReactElement }, SectionTitleProps>>,
  // @ts-expect-error section titles require heading content
  Assert<IsExact<{ eyebrow: 'Today' }, SectionTitleProps>>,
]
