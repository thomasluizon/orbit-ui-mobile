'use client'

import { IconButton } from '@/components/ui/icon-button'
import { X, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion, useIsPresent } from 'motion/react'
import { buildPromptPage } from '@orbit/shared/chat/prompt-library'
import { createUsePromptLibrary, groupPromptIdeas, type PromptIdeaGroup } from '@orbit/shared/chat/prompt-library-core'
import type { ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { ActionRow } from '@/components/ui/action-row'
import { AppBar } from '@/components/ui/app-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { CatalogIdea, PromptIdea } from './prompt-idea'

const usePromptLibrary = createUsePromptLibrary({ useState, useReducer, useEffect, useRef })

type PromptLibraryProps = {
  onBack: () => void
  onSelect: (id: string, label: string, prompt: string) => void
  suggestions: ComposerSuggestions
  hasProAccess: boolean
  hasGoogleConnection: boolean
  disabledReason?: string
}

function CatalogGroup({ group, searching, disabled, onSelect }: Readonly<{ group: PromptIdeaGroup; searching: boolean; disabled: boolean; onSelect: PromptLibraryProps['onSelect'] }>) {
  return <section aria-label={group.label}>
    {searching ? <h2 className="px-4 pb-3 font-medium tracking-[-0.01em] text-[var(--fg-1)]" style={{ fontSize: '1.25rem' }}>{group.label}</h2> : null}
    <div className="flex flex-col gap-3 px-4">{group.templates.map(template => <CatalogIdea key={template.id} template={template} disabled={disabled} onSelect={onSelect} />)}</div>
  </section>
}

export function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const reducedMotion = useReducedMotion()
  const isPresent = useIsPresent()
  const { filters, dispatch, select } = usePromptLibrary(isPresent, props.disabledReason)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { query } = filters
  const { categories, activeCategory, matches, lastPage, currentPage, visible } = buildPromptPage({ ...props, filters, locale, translate: t })
  useEffect(() => { if (isPresent) headingRef.current?.focus() }, [isPresent])

  return <motion.div data-prompt-library="" inert={!isPresent} aria-hidden={!isPresent} style={{ pointerEvents: isPresent ? undefined : 'none' }} className="absolute inset-0 z-[1] flex min-h-0 flex-col bg-[var(--bg)]"
    initial={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : motionLayerTiming.routeShift, transition: { duration: (reducedMotion ? motionDurations.micro : motionDurations.routeExit) / 1000 } }}
    transition={{ duration: (reducedMotion ? motionDurations.fast : motionDurations.base) / 1000, ease: motionEasings.standard }}>
    <div data-conversation-header="" className="shrink-0">
      <AppBar title={t('chat.templates.title')} titleVariant="screen" titleRef={headingRef} onBack={props.onBack} backLabel={t('chat.templates.back')} />
    </div>
    <div className="flex shrink-0 flex-col gap-3 px-4">
      {props.disabledReason ? <CapacityNotice message={props.disabledReason} /> : null}
      <Input kind="search" name="prompt-search" autoComplete="off" hideLabel label={t('chat.templates.search')} placeholder={t('chat.templates.search')} value={query} onChange={value => dispatch({ type: 'query', query: value })} />
      <div role="group" aria-label={t('chat.templates.title')} data-prompt-categories="" className="flex min-w-0 flex-nowrap gap-3 overflow-x-scroll pb-2">
        {categories.map(item => <div key={item} className="shrink-0"><Chip active={item === activeCategory && !query.trim()} onClick={() => { dispatch({ type: 'category', category: item }) }}>{t(`chat.templates.categories.${item}`)}</Chip></div>)}
      </div>
    </div>
    <div data-prompt-results="" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain py-4">
      {props.suggestions.length > 0 && !query.trim() ? <section aria-label={t('chat.templates.forYou')}>
        <h2 className="px-4 pb-3 font-medium tracking-[-0.01em] text-[var(--fg-1)]" style={{ fontSize: '1.25rem' }}>{t('chat.templates.forYou')}</h2>
        <div className="flex flex-col gap-3 px-4">{props.suggestions.map(suggestion => <PromptIdea key={suggestion.id} label={suggestion.label} icon={suggestion.icon} disabled={!!props.disabledReason} onSelect={() => select(() => { suggestion.onSelect(); props.onBack() })} />)}</div>
      </section> : null}
      {groupPromptIdeas(visible, t).map(group => <CatalogGroup key={group.category} group={group} searching={!!query.trim()} disabled={!!props.disabledReason} onSelect={(...selection) => select(() => props.onSelect(...selection))} />)}
      <div className={matches.length === 0 ? 'flex flex-col items-start gap-3 px-4 py-6' : 'sr-only'}>
        <p role="status" className={matches.length === 0 ? 'text-sm text-[var(--fg-3)]' : 'sr-only'}>{matches.length === 0 ? t('chat.templates.noMatches', { query: query.trim() }) : ''}</p>
        {matches.length === 0 ? <IconButton label={t('chat.templates.clearSearch')} onClick={() => { dispatch({ type: 'query', query: '' }) }}><X size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
      </div>
      {lastPage > 0 ? <div className="px-4 pt-4"><ActionRow>
        <IconButton label={t('chat.templates.previous')} disabled={currentPage === 0} onClick={() => dispatch({ type: 'page', page: currentPage - 1 })}><ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
        <IconButton label={t('chat.templates.more')} disabled={currentPage === lastPage} onClick={() => dispatch({ type: 'page', page: currentPage + 1 })}><ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </ActionRow></div> : null}
    </div>
  </motion.div>
}
