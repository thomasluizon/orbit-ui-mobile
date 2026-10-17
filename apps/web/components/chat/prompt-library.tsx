'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion, useIsPresent } from 'motion/react'
import { filterPromptTemplates, promptCategories, PROMPT_CATEGORIES, PROMPT_PAGE_SIZE, type PromptCategory } from '@orbit/shared/chat'
import type { ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { AppBar } from '@/components/ui/app-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { ListRow } from '@/components/ui/list-row'
import { Button } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'

type PromptLibraryProps = {
  onBack: () => void
  onSelect: (id: string, label: string, prompt: string) => void
  suggestions: ComposerSuggestions
  hasProAccess: boolean
  hasGoogleConnection: boolean
  disabledReason?: string
}

function usePromptFilters(visible: boolean) {
  const [category, setCategory] = useState<PromptCategory>('start')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [previousVisible, setPreviousVisible] = useState(visible)
  if (previousVisible !== visible) {
    setPreviousVisible(visible)
    if (visible) { setCategory('start'); setQuery(''); setPage(0) }
  }
  return { category, setCategory, query, setQuery, page, setPage }
}

export function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const reducedMotion = useReducedMotion()
  const isPresent = useIsPresent()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { category, setCategory, query, setQuery, page, setPage } = usePromptFilters(isPresent)
  const categories = promptCategories(props.hasProAccess, props.hasGoogleConnection)
  const activeCategory = categories.includes(category) ? category : 'start'
  const matches = filterPromptTemplates({ category: activeCategory, query, locale, categories, translate: t })
  const lastPage = Math.max(0, Math.ceil(matches.length / PROMPT_PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = matches.slice(currentPage * PROMPT_PAGE_SIZE, (currentPage + 1) * PROMPT_PAGE_SIZE)
  useEffect(() => { if (isPresent) headingRef.current?.focus() }, [isPresent])

  return <motion.div data-prompt-library="" inert={!isPresent} aria-hidden={!isPresent} style={{ pointerEvents: isPresent ? undefined : 'none' }} className="absolute inset-0 z-[1] flex min-h-0 flex-col bg-[var(--bg)]"
    initial={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift, transition: { duration: (reducedMotion ? motionDurations.micro : motionDurations.routeExit) / 1000 } }}
    transition={{ duration: (reducedMotion ? motionDurations.fast : motionDurations.base) / 1000, ease: motionEasings.standard }}>
    <AppBar title={t('chat.templates.title')} titleRef={headingRef} onBack={props.onBack} backLabel={t('chat.templates.back')} />
    <div className="flex shrink-0 flex-col gap-3 px-4">
      {props.disabledReason ? <CapacityNotice message={props.disabledReason} /> : null}
      <label className="flex flex-col gap-1 text-sm text-[var(--fg-2)]">{t('chat.templates.search')}
        <input type="search" name="prompt-search" autoComplete="off" data-focus-perimeter="" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }}
          className="orbit-field-hover min-h-[var(--touch-min)] w-full rounded-[8px] border-0 bg-[var(--bg-field)] px-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight]" />
      </label>
      <div role="group" aria-label={t('chat.templates.title')} data-prompt-categories="" className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {categories.map(item => <div key={item} className="shrink-0"><Chip active={item === activeCategory && !query.trim()} onClick={() => { setCategory(item); setQuery(''); setPage(0) }}>{t(`chat.templates.categories.${item}`)}</Chip></div>)}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      {props.suggestions.length > 0 ? <section aria-label={t('chat.templates.forYou')}>
        <SectionLabel>{t('chat.templates.forYou')}</SectionLabel>
        {props.suggestions.map(suggestion => <ListRow key={suggestion.id} title={suggestion.label} textMode="label" chevron={false} disabled={!!props.disabledReason} onClick={() => { suggestion.onSelect(); props.onBack() }} />)}
      </section> : null}
      {PROMPT_CATEGORIES.map(item => {
        const rows = visible.filter(template => template.category === item)
        return rows.length > 0 ? <section key={item} aria-label={t(`chat.templates.categories.${item}`)}>
          <SectionLabel>{t(`chat.templates.categories.${item}`)}</SectionLabel>
          {rows.map(template => <ListRow key={template.id} title={t(template.labelKey)} textMode="label" chevron={false} disabled={!!props.disabledReason}
            onClick={() => props.onSelect(template.id, t(template.labelKey), t(template.promptKey))} />)}
        </section> : null
      })}
      <div className={matches.length === 0 ? 'flex flex-col items-start gap-3 px-4 py-6' : ''}>
        <p role="status" className={matches.length === 0 ? 'text-sm text-[var(--fg-3)]' : 'sr-only'}>{matches.length === 0 ? t('chat.templates.noMatches', { query: query.trim() }) : ''}</p>
        {matches.length === 0 ? <Button variant="ghost" onClick={() => { setQuery(''); setPage(0) }}>{t('chat.templates.clearSearch')}</Button> : null}
      </div>
      {lastPage > 0 ? <div className="px-4 pt-4"><ActionRow>
        <Button variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('chat.templates.previous')}</Button>
        <Button variant="ghost" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t('chat.templates.more')}</Button>
      </ActionRow></div> : null}
    </div>
  </motion.div>
}
