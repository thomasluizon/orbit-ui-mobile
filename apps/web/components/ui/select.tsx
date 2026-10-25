'use client'

import * as Primitive from '@radix-ui/react-select'
import { useComposedRefs } from '@radix-ui/react-compose-refs'
import { createContext, useCallback, useContext, useState, type ComponentProps, type ReactNode } from 'react'
import type { SelectOption, SelectProps } from '@orbit/shared/contracts/forms'
import { Check, ChevronDown } from '@/components/ui/icons'

const SelectContext = createContext<((element: HTMLButtonElement | null) => void) | null>(null)
const PortalContext = createContext<HTMLElement | null>(null)

export function Root({ value, onChange, options, disabled, children }: Readonly<SelectProps & { children: ReactNode }>) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const resolveContainer = useCallback((element: HTMLButtonElement | null) => {
    if (element) setContainer(element.closest('[role="dialog"]'))
  }, [])
  return <SelectContext.Provider value={resolveContainer}><PortalContext.Provider value={container}>
    <Primitive.Root value={value ?? options.find((option) => !option.disabled)?.value ?? ''} disabled={disabled} onValueChange={(next) => {
      if (options.some((option) => option.value === next && !option.disabled)) onChange(next)
    }}>{children}</Primitive.Root>
  </PortalContext.Provider></SelectContext.Provider>
}

export function Trigger({ children, ref, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  const resolveContainer = useContext(SelectContext)
  const composedRef = useComposedRefs(ref, resolveContainer)
  return <Primitive.Trigger {...props} ref={composedRef} className="flex w-full min-h-[54px] items-center justify-between gap-3 rounded-[12px] border-0 transition-[background-color,box-shadow] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] bg-[var(--bg-field)] py-3 pr-4 pl-4 text-left text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] disabled:opacity-50">
    {children}<Primitive.Icon asChild><ChevronDown size={20} strokeWidth={1.8} className="text-[var(--fg-3)]" aria-hidden="true" /></Primitive.Icon>
  </Primitive.Trigger>
}

export function Portal({ children }: Readonly<{ children: ReactNode }>) {
  const container = useContext(PortalContext)
  return <Primitive.Portal container={container}>{children}</Primitive.Portal>
}

export function Content({ children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content {...props} position="popper" onEscapeKeyDown={(event) => { event.stopPropagation(); props.onEscapeKeyDown?.(event) }} sideOffset={8} className="z-dropdown min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[20px] bg-[var(--bg-sheet)] p-2 text-[var(--fg-1)] shadow-[var(--sh-2)]">
    <Primitive.Viewport style={{ maxHeight: 'min(240px, var(--radix-select-content-available-height))' }}>{children}</Primitive.Viewport>
  </Primitive.Content>
}

export function SelectCheck() {
  return <Primitive.ItemIndicator><Check size={20} aria-hidden="true" /></Primitive.ItemIndicator>
}

export function Item({ value, label, disabled }: Readonly<SelectOption>) {
  return <Primitive.Item value={value} textValue={label} disabled={disabled} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)] data-[highlighted]:bg-[var(--bg-hover)] data-[disabled]:opacity-50">
    <Primitive.ItemText>{label}</Primitive.ItemText><SelectCheck />
  </Primitive.Item>
}

export function Select(props: Readonly<SelectProps>) {
  return <Root {...props}><Trigger aria-label={props.label}><Primitive.Value /></Trigger><Portal><Content aria-label={props.label}>
    {props.options.map((option) => <Item key={option.value} {...option} />)}
  </Content></Portal></Root>
}
