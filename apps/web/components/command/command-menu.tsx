'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, CheckCircle2, Plus, Search, SkipForward } from '@/components/ui/icons'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from 'cmdk'
import { Input } from '@/components/ui/input'
import { useUIStore } from '@/stores/ui-store'
import { useHabits, useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { CommandRow } from './command-row'
import { CommandHabitItems } from './command-habit-items'
import { buildCommandHabitList } from './build-command-habit-list'
import type { CommandNavigationItem } from './command-palette'

type CommandPage = 'log' | 'skip'

const GROUP_CLASS =
  'mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-[var(--fg-3)]'

const ICON_CLASS = 'size-5'

const SKELETON_ROW_WIDTHS = ['62%', '48%', '71%'] as const

function CommandHabitSkeleton({ heading }: Readonly<{ heading: string }>) {
  return (
    <CommandGroup forceMount heading={heading} className={GROUP_CLASS}>
      <div aria-hidden="true">
        {SKELETON_ROW_WIDTHS.map((width) => (
          <div key={width} className="flex min-h-[44px] items-center gap-3 px-3">
            <span className="skeleton-pulse size-6 shrink-0 rounded-[8px] bg-[var(--bg-well)]" />
            <span
              className="skeleton-pulse h-4 rounded-[8px] bg-[var(--bg-well)]"
              style={{ width }}
            />
          </div>
        ))}
      </div>
    </CommandGroup>
  )
}

function CommandKeyHint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <span className="flex items-center gap-2">
      {keys.map((key) => (
        <kbd
          key={key}
          className="t-meta flex h-6 min-w-6 items-center justify-center rounded-[8px] px-1"
          style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
        >
          {key}
        </kbd>
      ))}
      <span className="t-meta">{label}</span>
    </span>
  )
}

interface CommandMenuProps {
  navItems: readonly CommandNavigationItem[]
  onCreateHabit: () => void
  onClose: () => void
}

/**
 * The cmdk command list mounted inside the palette overlay: the search input, the
 * grouped commands (create, actions, navigate, habit search), the log/skip
 * habit-picker sub-pages with a breadcrumb back strip, and a key-hint footer.
 * Only mounted while the palette is open; the palette overlay owns initial focus.
 */
export function CommandMenu({ navItems, onCreateHabit, onClose }: Readonly<CommandMenuProps>) {
  const t = useTranslations()
  const router = useRouter()
  const setActiveView = useUIStore((state) => state.setActiveView)
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [pages, setPages] = useState<CommandPage[]>([])
  const activePage = pages.at(-1) ?? null

  const { data, isPending, isSuccess } = useHabits({})
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const habitEntries = useMemo(() => (data ? buildCommandHabitList(data) : []), [data])

  function run(action: () => void) {
    action()
    onClose()
  }

  function openPage(page: CommandPage) {
    setPages((previous) => [...previous, page])
    setSearch('')
  }

  function popPage() {
    setPages((previous) => previous.slice(0, -1))
    setSearch('')
  }

  function jumpToToday() {
    setActiveView('today')
    router.push('/')
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Backspace' && search === '' && pages.length > 0) {
      event.preventDefault()
      popPage()
    }
    if (event.key === 'Escape' && activePage !== null) {
      event.preventDefault()
      event.stopPropagation()
      popPage()
    }
  }

  let activePageLabel: string | null = null
  if (activePage !== null) {
    activePageLabel = t(activePage === 'log' ? 'command.logHabit' : 'command.skipHabit')
  }
  const escapeHintLabel = activePage === null
    ? t('command.hints.close')
    : t('command.hints.back')

  const renderHabitActionGroup = () => {
    if (isPending) {
      return <CommandHabitSkeleton heading={activePageLabel ?? ''} />
    }
    return (
      <CommandGroup heading={activePageLabel} className={GROUP_CLASS}>
        <CommandHabitItems
          entries={habitEntries}
          onSelectHabit={(habit) =>
            run(() => {
              if (activePage === 'log') logHabit.mutate({ habitId: habit.id })
              else skipHabit.mutate({ habitId: habit.id })
            })
          }
        />
      </CommandGroup>
    )
  }

  return (
    <Command
      label={t('command.title')}
      className="flex flex-col overflow-hidden"
      onKeyDown={handleInputKeyDown}
    >
      {activePageLabel !== null && (
        <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-2 py-2">
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={() => {
              popPage()
              inputRef.current?.focus()
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--fg-3)] transition-[background-color,color,transform] [transition-duration:var(--dur-hover-control),var(--dur-hover-control),150ms] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] active:scale-[0.96]"
          >
            <ArrowLeft size={20} strokeWidth={1.8} aria-hidden />
          </button>
          <span
            className="rounded-[8px] px-3 py-1 text-[12px] font-medium text-[var(--fg-2)]"
            style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
          >
            {activePageLabel}
          </span>
        </div>
      )}

      <div className="border-b border-[var(--hairline)] p-4">
        <div className="relative [&_label]:sr-only">
          <div
            aria-hidden="true"
            inert
            className="pointer-events-none [&_.opacity-60]:opacity-100"
          >
            <Input
              label={t('command.title')}
              value=""
              onChange={setSearch}
              disabled
              trailing={
                <Search
                  className="size-5 text-[var(--fg-3)]"
                  strokeWidth={1.8}
                  aria-hidden
                />
              }
            />
          </div>
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={t('command.placeholder')}
            className="absolute inset-x-0 bottom-0 h-[54px] rounded-[12px] bg-transparent px-4 pr-12 text-[16px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-3)] focus-visible:shadow-[inset_0_0_0_2px_var(--primary)]"
          />
        </div>
      </div>

      <CommandList className="max-h-[min(60vh,400px)] overflow-y-auto overflow-x-hidden overscroll-contain p-2">
        {isSuccess && (
          <CommandEmpty className="px-3 py-6 text-center text-[14px] text-[var(--fg-3)]">
            {t('command.empty')}
          </CommandEmpty>
        )}

        {activePage === null ? (
          <>
            {isPending ? (
              <CommandHabitSkeleton heading={t('command.groups.search')} />
            ) : (
              <CommandGroup
                forceMount
                heading={t('command.groups.search')}
                className={GROUP_CLASS}
                data-command-group="habits"
              >
                <CommandHabitItems entries={habitEntries} onSelectHabit={() => run(jumpToToday)} />
              </CommandGroup>
            )}

            <CommandGroup
              forceMount
              heading={t('command.groups.actions')}
              className={GROUP_CLASS}
              data-command-group="actions"
            >
              <CommandRow
                leading={<Plus className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                label={t('command.createHabit')}
                value={t('command.createHabit')}
                onSelect={() => run(onCreateHabit)}
              />
              <CommandRow
                leading={<CheckCircle2 className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                label={t('command.logHabit')}
                value={t('command.logHabit')}
                onSelect={() => openPage('log')}
              />
              <CommandRow
                leading={<SkipForward className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                label={t('command.skipHabit')}
                value={t('command.skipHabit')}
                onSelect={() => openPage('skip')}
              />
            </CommandGroup>

            <CommandGroup
              forceMount
              heading={t('command.groups.destinations')}
              className={GROUP_CLASS}
              data-command-group="destinations"
            >
              {navItems.map((item) => (
                <CommandRow
                  key={item.id}
                  leading={<item.icon className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                  label={item.label}
                  value={item.label}
                  onSelect={() => run(item.onSelect)}
                />
              ))}
            </CommandGroup>

          </>
        ) : (
          renderHabitActionGroup()
        )}
      </CommandList>

      <div
        className="flex flex-wrap items-center gap-4 border-t border-[var(--hairline)] px-4 py-3"
      >
        <CommandKeyHint keys={['↑', '↓']} label={t('command.hints.navigate')} />
        <CommandKeyHint keys={['↵']} label={t('command.hints.select')} />
        <CommandKeyHint keys={['Esc']} label={escapeHintLabel} />
        {activePage !== null && <CommandKeyHint keys={['⌫']} label={t('command.hints.back')} />}
      </div>
    </Command>
  )
}
