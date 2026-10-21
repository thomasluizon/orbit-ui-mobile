'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion, useIsPresent } from 'motion/react'
import { buildPromptPage, INITIAL_PROMPT_FILTERS, reducePromptFilters, PROMPT_CATEGORIES, type PromptCategory, type PromptTemplate } from '@orbit/shared/chat/prompt-library'
import type { ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { AppBar } from '@/components/ui/app-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { CatalogIdea, PromptIdea } from './prompt-idea'
import { Button } from '@/components/ui/pill-button'

type PromptLibraryProps = {
  onBack: () => void
  onSelect: (id: string, label: string, prompt: string) => void
  suggestions: ComposerSuggestions
  hasProAccess: boolean
  hasGoogleConnection: boolean
  disabledReason?: string
}

function CatalogGroup({ category, templates, searching, disabled, onSelect }: Readonly<{ category: PromptCategory; templates: readonly PromptTemplate[]; searching: boolean; disabled: boolean; onSelect: PromptLibraryProps['onSelect'] }>) {
  const t = useTranslations()
  const rows = templates.filter(template => template.category === category)
  if (rows.length === 0) return null
  return <section aria-label={t(`chat.templates.categories.${category}`)}>
    {searching ? <h2 className="px-4 pb-3 font-medium tracking-[-0.01em] text-[var(--fg-1)]" style={{ fontSize: '1.25rem' }}>{t(`chat.templates.categories.${category}`)}</h2> : null}
    <div className="flex flex-col gap-3 px-4">{rows.map(template => <CatalogIdea key={template.id} template={template} disabled={disabled} onSelect={onSelect} />)}</div>
  </section>
}

function useLibraryFilters(visible: boolean) {
  const [filters, dispatch] = useReducer(reducePromptFilters, INITIAL_PROMPT_FILTERS)
  const [previousVisible, setPreviousVisible] = useState(visible)
  if (previousVisible !== visible) {
    setPreviousVisible(visible)
    if (visible) dispatch({ type: 'reset' })
  }
  return [filters, dispatch] as const
}

function useIdeaActivation(visible: boolean, disabledReason?: string) {
  const activated = useRef(false)
  useEffect(() => { activated.current = !visible; return () => { activated.current = true } }, [visible])
  return (action: () => void) => {
    if (!visible || disabledReason || activated.current) return
    activated.current = true
    action()
  }
}

export function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const reducedMotion = useReducedMotion()
  const isPresent = useIsPresent()
  const select = useIdeaActivation(isPresent, props.disabledReason)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [filters, dispatch] = useLibraryFilters(isPresent)
  const { query } = filters
  const { categories, activeCategory, matches, lastPage, currentPage, visible } = buildPromptPage({ ...props, filters, locale, translate: t })
  useEffect(() => { if (isPresent) headingRef.current?.focus() }, [isPresent])

  return <motion.div data-prompt-library="" inert={!isPresent} aria-hidden={!isPresent} style={{ pointerEvents: isPresent ? undefined : 'none' }} className="absolute inset-0 z-[1] flex min-h-0 flex-col bg-[var(--bg)]"
    initial={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift, transition: { duration: (reducedMotion ? motionDurations.micro : motionDurations.routeExit) / 1000 } }}
    transition={{ duration: (reducedMotion ? motionDurations.fast : motionDurations.base) / 1000, ease: motionEasings.standard }}>
    <AppBar title={t('chat.templates.title')} titleRef={headingRef} onBack={props.onBack} backLabel={t('chat.templates.back')} />
    <div className="flex shrink-0 flex-col gap-3 px-4">
      {props.disabledReason ? <CapacityNotice message={props.disabledReason} /> : null}
      <label className="flex flex-col gap-1 text-sm text-[var(--fg-2)]">{t('chat.templates.search')}
        <input type="search" name="prompt-search" autoComplete="off" data-focus-perimeter="" value={query} onChange={event => { dispatch({ type: 'query', query: event.target.value }) }}
          className="orbit-field-hover min-h-[var(--touch-min)] w-full rounded-[8px] border-0 bg-[var(--bg-field)] px-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight]" />
      </label>
      <div role="group" aria-label={t('chat.templates.title')} data-prompt-categories="" className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {categories.map(item => <div key={item} className="shrink-0"><Chip active={item === activeCategory && !query.trim()} onClick={() => { dispatch({ type: 'category', category: item }) }}>{t(`chat.templates.categories.${item}`)}</Chip></div>)}
      </div>
    </div>
    <div data-prompt-results="" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain py-4">
      {props.suggestions.length > 0 && !query.trim() ? <section aria-label={t('chat.templates.forYou')}>
        <h2 className="px-4 pb-3 font-medium tracking-[-0.01em] text-[var(--fg-1)]" style={{ fontSize: '1.25rem' }}>{t('chat.templates.forYou')}</h2>
        <div className="flex flex-col px-4">{props.suggestions.map(suggestion => <PromptIdea key={suggestion.id} label={suggestion.label} icon={suggestion.icon} disabled={!!props.disabledReason} onSelect={() => select(() => { suggestion.onSelect(); props.onBack() })} />)}</div>
      </section> : null}
      {PROMPT_CATEGORIES.map(category => <CatalogGroup key={category} category={category} templates={visible} searching={!!query.trim()} disabled={!!props.disabledReason} onSelect={(...selection) => select(() => props.onSelect(...selection))} />)}
      <div className={matches.length === 0 ? 'flex flex-col items-start gap-3 px-4 py-6' : 'sr-only'}>
        <p role="status" className={matches.length === 0 ? 'text-sm text-[var(--fg-3)]' : 'sr-only'}>{matches.length === 0 ? t('chat.templates.noMatches', { query: query.trim() }) : ''}</p>
        {matches.length === 0 ? <Button variant="ghost" onClick={() => { dispatch({ type: 'query', query: '' }) }}>{t('chat.templates.clearSearch')}</Button> : null}
      </div>
      {lastPage > 0 ? <div className="px-4 pt-4"><ActionRow>
        <Button variant="ghost" disabled={currentPage === 0} onClick={() => dispatch({ type: 'page', page: currentPage - 1 })}>{t('chat.templates.previous')}</Button>
        <Button variant="ghost" disabled={currentPage === lastPage} onClick={() => dispatch({ type: 'page', page: currentPage + 1 })}>{t('chat.templates.more')}</Button>
      </ActionRow></div> : null}
    </div>
  </motion.div>
}
