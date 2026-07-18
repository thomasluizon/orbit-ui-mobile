'use client'

import { useMemo, useState, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, CheckCircle2, Plus, Search, SkipForward, Target } from '@/components/ui/icons'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from 'cmdk'
import type { SidebarNavItem } from '@/components/navigation/app-sidebar'
import { SkeletonRow } from '@/components/ui/skeleton'
import { useUIStore } from '@/stores/ui-store'
import { useHabits, useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { CommandRow } from './command-row'
import { CommandHabitItems } from './command-habit-items'
import { buildCommandHabitList } from './build-command-habit-list'

type CommandPage = 'log' | 'skip'

const GROUP_CLASS =
  'mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[var(--fg-3)]'

const ICON_CLASS = 'size-[22px]'

const SKELETON_ROW_WIDTHS = ['w-[62%]', 'w-[48%]', 'w-[71%]'] as const

function CommandHabitSkeleton({ heading }: Readonly<{ heading: string }>) {
  return (
    <div aria-hidden="true" className="mb-1">
      <div className="px-2.5 pb-1 pt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">
        {heading}
      </div>
      {SKELETON_ROW_WIDTHS.map((width) => (
        <SkeletonRow
          key={width}
          media="square"
          lineWidths={[width]}
          className="min-h-[44px] px-2.5 py-0"
        />
      ))}
    </div>
  )
}

function CommandKeyHint({ keys, label }: Readonly<{ keys: readonly string[]; label: string }>) {
  return (
    <span className="flex items-center" style={{ gap: 6 }}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="t-meta flex h-[18px] min-w-[18px] items-center justify-center rounded-[8px] px-1"
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
  navItems: readonly SidebarNavItem[]
  onCreateHabit: () => void
  onCreateGoal: () => void
  onClose: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * The cmdk command list mounted inside the palette overlay: the search input, the
 * grouped commands (create, actions, navigate, habit search), the log/skip
 * habit-picker sub-pages with a breadcrumb back strip, and a key-hint footer.
 * Only mounted while the palette is open; the palette owns focus via `inputRef`.
 */
export function CommandMenu({ navItems, onCreateHabit, onCreateGoal, onClose, inputRef }: Readonly<CommandMenuProps>) {
  const t = useTranslations()
  const router = useRouter()
  const setActiveView = useUIStore((state) => state.setActiveView)
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

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && search === '' && pages.length > 0) {
      event.preventDefault()
      popPage()
    }
  }

  let activePageLabel: string | null = null
  if (activePage !== null) {
    activePageLabel = t(activePage === 'log' ? 'command.logHabit' : 'command.skipHabit')
  }

  const renderSearchResults = () => {
    if (isPending) {
      return <CommandHabitSkeleton heading={t('command.groups.search')} />
    }
    if (habitEntries.length > 0) {
      return (
        <CommandGroup heading={t('command.groups.search')} className={GROUP_CLASS}>
          <CommandHabitItems entries={habitEntries} onSelectHabit={() => run(jumpToToday)} />
        </CommandGroup>
      )
    }
    return null
  }

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
    <Command label={t('command.title')} className="flex flex-col overflow-hidden">
      {activePageLabel !== null && (
        <div className="flex items-center border-b border-[var(--hairline)] px-2" style={{ gap: 4, paddingBlock: 6 }}>
          <button
            type="button"
            aria-label={t('common.back')}
            onClick={() => {
              popPage()
              inputRef.current?.focus()
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)] active:scale-[0.96]"
          >
            <ArrowLeft size={18} strokeWidth={1.8} aria-hidden />
          </button>
          <span
            className="rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--fg-2)]"
            style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
          >
            {activePageLabel}
          </span>
        </div>
      )}

      <div className="field-ring-flush flex items-center gap-2.5 border-b border-[var(--hairline)] px-4">
        <Search className="size-[18px] shrink-0 text-[var(--fg-3)]" strokeWidth={1.8} aria-hidden />
        <CommandInput
          ref={inputRef}
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleInputKeyDown}
          placeholder={t('command.placeholder')}
          className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-[var(--fg-1)] placeholder:text-[var(--fg-4)]"
        />
      </div>

      <CommandList className="max-h-[min(60vh,400px)] overflow-y-auto overflow-x-hidden overscroll-contain p-2">
        {isSuccess && (
          <CommandEmpty className="px-3 py-6 text-center text-[14px] text-[var(--fg-3)]">
            {t('command.empty')}
          </CommandEmpty>
        )}

        {activePage === null ? (
          <>
            <CommandGroup heading={t('command.groups.create')} className={GROUP_CLASS}>
              <CommandRow
                leading={<Plus className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                label={t('command.createHabit')}
                value={t('command.createHabit')}
                onSelect={() => run(onCreateHabit)}
              />
              <CommandRow
                leading={<Target className={ICON_CLASS} strokeWidth={1.8} aria-hidden />}
                label={t('command.createGoal')}
                value={t('command.createGoal')}
                onSelect={() => run(onCreateGoal)}
              />
            </CommandGroup>

            <CommandGroup heading={t('command.groups.actions')} className={GROUP_CLASS}>
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

            <CommandGroup heading={t('command.groups.navigate')} className={GROUP_CLASS}>
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

            {renderSearchResults()}
          </>
        ) : (
          renderHabitActionGroup()
        )}
      </CommandList>

      <div
        className="flex flex-wrap items-center border-t border-[var(--hairline)] px-4"
        style={{ gap: 16, paddingBlock: 10 }}
      >
        <CommandKeyHint keys={['↑', '↓']} label={t('command.hints.navigate')} />
        <CommandKeyHint keys={['↵']} label={t('command.hints.select')} />
        <CommandKeyHint keys={['Esc']} label={t('command.hints.close')} />
        {activePage !== null && <CommandKeyHint keys={['⌫']} label={t('command.hints.back')} />}
      </div>
    </Command>
  )
}
