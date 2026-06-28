'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Plus, Search, SkipForward, Target } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from 'cmdk'
import type { SidebarNavItem } from '@/components/navigation/app-sidebar'
import { useUIStore } from '@/stores/ui-store'
import { useHabits, useLogHabit, useSkipHabit } from '@/hooks/use-habits'
import { CommandRow } from './command-row'
import { CommandHabitItems } from './command-habit-items'

type CommandPage = 'log' | 'skip'

const GROUP_CLASS =
  'mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-[var(--fg-3)]'

const ICON_CLASS = 'size-[22px]'

interface CommandMenuProps {
  navItems: readonly SidebarNavItem[]
  onCreateHabit: () => void
  onCreateGoal: () => void
  onClose: () => void
}

/**
 * The cmdk command list mounted inside the palette overlay: the search input, the
 * grouped commands (create, actions, navigate, habit search), and the log/skip
 * habit-picker sub-pages. Only mounted while the palette is open.
 */
export function CommandMenu({ navItems, onCreateHabit, onCreateGoal, onClose }: Readonly<CommandMenuProps>) {
  const t = useTranslations()
  const router = useRouter()
  const setActiveView = useUIStore((state) => state.setActiveView)
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [pages, setPages] = useState<CommandPage[]>([])
  const activePage = pages.at(-1) ?? null

  const { data } = useHabits({})
  const logHabit = useLogHabit()
  const skipHabit = useSkipHabit()
  const habits = data?.topLevelHabits ?? []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

  return (
    <Command label={t('command.placeholder')} className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--hairline)] px-4">
        <Search className="size-[18px] shrink-0 text-[var(--fg-3)]" strokeWidth={1.8} aria-hidden />
        <CommandInput
          ref={inputRef}
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleInputKeyDown}
          placeholder={t('command.placeholder')}
          className="h-14 flex-1 bg-transparent text-[16px] text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-4)]"
        />
      </div>

      <CommandList className="max-h-[min(60vh,400px)] overflow-y-auto overflow-x-hidden overscroll-contain p-2">
        <CommandEmpty className="px-3 py-6 text-center text-[14px] text-[var(--fg-3)]">
          {t('command.empty')}
        </CommandEmpty>

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

            {habits.length > 0 && (
              <CommandGroup heading={t('command.groups.search')} className={GROUP_CLASS}>
                <CommandHabitItems habits={habits} onSelectHabit={() => run(jumpToToday)} />
              </CommandGroup>
            )}
          </>
        ) : (
          <CommandGroup
            heading={t(activePage === 'log' ? 'command.logHabit' : 'command.skipHabit')}
            className={GROUP_CLASS}
          >
            <CommandHabitItems
              habits={habits}
              onSelectHabit={(habit) =>
                run(() => {
                  if (activePage === 'log') logHabit.mutate({ habitId: habit.id })
                  else skipHabit.mutate({ habitId: habit.id })
                })
              }
            />
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
