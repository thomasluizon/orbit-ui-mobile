import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { Composer } from '@/components/shell/composer'
import { CompactComposerMenuContext, useCompactComposerMenu } from '@/components/shell/shell-pinned-content'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useRef } from 'react'
import { TodayDateControl } from '@/app/(app)/today-shell'

const configuration = JSON.parse(document.getElementById('configuration')!.textContent!) as {
  locale: 'en' | 'pt-BR'
  surface: 'habit' | 'composer' | 'frequency'
}
const words = configuration.locale === 'en' ? en : ptBR
const branchTitle = 'Branch child with a long title about preparing the room and collecting every book and notebook for the next reading session'

function HabitMenus() {
  const [depth, setDepth] = useState(0)
  const title = depth === 0 ? 'Parent' : branchTitle
  return <main style={{ padding: 16 }}>
    <h2>{title}</h2>
    <div style={{ height: depth === 0 ? 0 : 250 }} />
    {depth < 2 ? <HabitRow key={depth} habit={createMockHabit({ id: String(depth), title })} hasSubHabits hasChildren
      childProgress={{ done: 0, total: 2 }} actions={{ onDrillInto: () => setDepth(depth + 1), onEdit: () => {}, onDelete: () => {} }} /> : <output>Deepest child</output>}
  </main>
}

function ComposerMenu() {
  const wide = useViewportMatch('(min-width: 1024px)')
  const bottomRef = useRef<HTMLDivElement>(null)
  const compactMenu = useCompactComposerMenu(wide, bottomRef)
  return <div data-shell>
    <button data-shell-astra-row style={{ display: wide ? undefined : 'none' }}>Astra</button>
    <div ref={bottomRef} style={{ position: 'fixed', bottom: 96, width: '100%' }}>
      {!wide ? <CompactComposerMenuContext value={compactMenu}>
        <Composer state="idle" value="Retained draft" onChangeValue={() => {}} onSend={() => {}} words={words.shell.composer}
          suggestions={[]} onAttachFile={() => {}} onAttachImage={() => {}} onVoice={() => {}}
          attachWords={{ ...words.shell.composer.attach, remove: (name) => name }} voiceWords={words.shell.composer.voice} />
      </CompactComposerMenuContext> : null}
    </div>
  </div>
}

function FrequencyMenu() {
  const noop = () => {}
  return <TodayDateControl dayName={words.dates.today} numericDate="04/09" isTodaySelected nextDisabled={false}
    previousLabel={words.dates.previousDay} goToTodayLabel={words.dates.goToToday}
    nextLabel={words.dates.nextDay} moreLabel={words.habits.listOptions} menuHeading={words.common.options}
    selectLabel={words.common.select} collapseLabel={words.habits.collapseAll} allCollapsed={false}
    refreshLabel={words.habits.refresh} completedLabel={words.habits.showCompleted} showCompleted={false}
    isFetching={false} searchLabel={words.habits.search.title} onSearch={noop}
    onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
    onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />
}

createRoot(document.getElementById('root')!).render(<NextIntlClientProvider locale={configuration.locale} messages={words} timeZone="UTC">
  {configuration.surface === 'habit' ? <HabitMenus /> : configuration.surface === 'composer' ? <ComposerMenu /> : <FrequencyMenu />}
</NextIntlClientProvider>)
