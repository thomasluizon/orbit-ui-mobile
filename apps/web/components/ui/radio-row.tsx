'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { getRadioNavigationIndex } from '@orbit/shared/utils'

interface RadioItemState {
  disabled: boolean
  id: string
  selected: boolean
}

interface RadioGroupContextValue {
  commit: () => void
  getTabIndex: (id: string) => 0 | -1
  moveSelection: (id: string, key: string) => boolean
  register: (id: string) => () => void
  setElement: (id: string, element: HTMLButtonElement | null) => void
  setHandler: (id: string, handler: () => void) => void
  update: (state: RadioItemState) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export function useRadioGroupItem({
  disabled,
  onSelect,
  selected,
}: Readonly<{
  disabled: boolean
  onSelect?: () => void
  selected: boolean
}>) {
  const group = useContext(RadioGroupContext)
  const registerWithGroup = group?.register
  const commitGroup = group?.commit
  const getGroupTabIndex = group?.getTabIndex
  const moveGroupSelection = group?.moveSelection
  const setGroupElement = group?.setElement
  const setGroupHandler = group?.setHandler
  const updateGroup = group?.update
  const id = useId()

  useLayoutEffect(() => registerWithGroup?.(id), [id, registerWithGroup])
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, selected })
  }, [disabled, id, selected, updateGroup])
  useLayoutEffect(() => {
    setGroupHandler?.(id, onSelect ?? (() => undefined))
  }, [id, onSelect, setGroupHandler])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
      if (!moveGroupSelection?.(id, event.key)) return
      event.preventDefault()
  }, [id, moveGroupSelection])
  /** A native button raises click for a pointer press, Enter and Space alike, so this is the only commit path. */
  const onActivate = useCallback(() => {
    if (!selected) onSelect?.()
    commitGroup?.()
  }, [commitGroup, onSelect, selected])
  const elementRef = useCallback((element: HTMLButtonElement | null) => {
    setGroupElement?.(id, element)
  }, [id, setGroupElement])
  const tabIndex = getGroupTabIndex?.(id) ?? 0

  return { elementRef, onActivate, onKeyDown, tabIndex }
}

export function RadioGroup({ children, onCommit, ...props }: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'role'> & {
    children: ReactNode
    /** Runs when a row is explicitly activated, never when an arrow key moves the selection. */
    onCommit?: () => void
  }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const elementsRef = useRef(new Map<string, HTMLButtonElement>())
  const handlersRef = useRef(new Map<string, () => void>())
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  const commit = useCallback(() => onCommitRef.current?.(), [])
  const register = useCallback((id: string) => {
    setItems((current) => [...current.filter((item) => item.id !== id), { disabled: false, id, selected: false }])
    return () => {
      setItems((current) => current.filter((item) => item.id !== id))
      elementsRef.current.delete(id)
      handlersRef.current.delete(id)
    }
  }, [])
  const update = useCallback((state: RadioItemState) => {
    setItems((current) => current.map((item) => item.id === state.id ? state : item))
  }, [])
  const setElement = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) elementsRef.current.set(id, element)
    else elementsRef.current.delete(id)
  }, [])
  const setHandler = useCallback((id: string, handler: () => void) => {
    handlersRef.current.set(id, handler)
  }, [])
  const getEnabledItems = useCallback(() => items
    .filter((item) => !item.disabled)
    .sort((first, second) => {
      const firstElement = elementsRef.current.get(first.id)
      const secondElement = elementsRef.current.get(second.id)
      if (!firstElement || !secondElement) return 0
      const nodeType = firstElement.ownerDocument.defaultView?.Node
      if (!nodeType) return 0
      const position = firstElement.compareDocumentPosition(secondElement)
      if (position & nodeType.DOCUMENT_POSITION_FOLLOWING) return -1
      if (position & nodeType.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    }), [items])
  const getTabIndex = useCallback((id: string): 0 | -1 => {
    const enabledItems = getEnabledItems()
    const selectedItem = enabledItems.find((item) => item.selected)
    return (selectedItem ?? enabledItems[0])?.id === id ? 0 : -1
  }, [getEnabledItems])
  const moveSelection = useCallback((id: string, key: string) => {
    const enabledItems = getEnabledItems()
    const currentIndex = enabledItems.findIndex((item) => item.id === id)
    if (currentIndex < 0) return false
    const nextIndex = getRadioNavigationIndex(key, currentIndex, enabledItems.length)
    if (nextIndex === null) return false
    const nextItem = enabledItems[nextIndex]
    if (!nextItem) return false
    elementsRef.current.get(nextItem.id)?.focus()
    if (!nextItem.selected) handlersRef.current.get(nextItem.id)?.()
    return true
  }, [getEnabledItems])
  const contextValue = useMemo(() => ({
    commit,
    getTabIndex,
    moveSelection,
    register,
    setElement,
    setHandler,
    update,
  }), [commit, getTabIndex, moveSelection, register, setElement, setHandler, update])

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div {...props} role="radiogroup">{children}</div>
    </RadioGroupContext.Provider>
  )
}

function RadioGlyph({ selected }: Readonly<{ selected: boolean }>) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: 24,
        height: 24,
        background: selected ? 'var(--primary)' : 'transparent',
        boxShadow: selected ? undefined : 'inset 0 0 0 1.5px var(--hairline-strong)',
      }}
    >
      {selected ? <span className="rounded-full" style={{ width: 9, height: 9, background: 'var(--fg-on-primary)' }} /> : null}
    </span>
  )
}

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps>) {
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled, onSelect, selected })
  const content = (
    <>
      {leading ? <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--r-well)]">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
        <span style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 16, lineHeight: 1.3 }}>{label}</span>
        {description ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.4 }}>{description}</span> : null}
        {disabled && reason ? <span style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4 }}>{reason}</span> : null}
      </span>
      {meta ? <span className="shrink-0" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{meta}</span> : null}
      {tag ? <span className="shrink-0 uppercase" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em' }}>{tag}</span> : null}
      <RadioGlyph selected={selected} />
    </>
  )
  const style = {
    gap: 12,
    minHeight: 52,
    paddingBlock: 8,
    paddingInlineStart: 20 + Math.max(0, depth) * 20,
    paddingInlineEnd: 16,
    background: selected ? 'rgba(var(--primary-rgb), 0.10)' : 'transparent',
    boxShadow: selected ? 'inset 0 0 0 1.5px var(--primary)' : undefined,
    borderRadius: 'var(--r-well)',
    opacity: disabled ? 0.5 : 1,
  } as const

  return disabled ? (
    <div role="radio" aria-checked={selected} aria-disabled="true" className="flex items-center" style={style}>{content}</div>
  ) : (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className="flex w-full cursor-pointer items-center border-0 text-left hover:bg-[var(--bg-elev)] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
      style={style}
    >{content}</button>
  )
}
