'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Orbit,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { userFactKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  normalizeUserFactCategory,
  USER_FACTS_PER_PAGE,
} from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow } from '@/components/ui/settings-row'
import { SelectCheck } from '@/components/ui/select-check'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { ProBadge } from '@/components/ui/pro-badge'
import { updateAiMemory, updateAiSummary } from '@/app/actions/profile'
import { bulkDeleteUserFacts, deleteUserFact } from '@/app/actions/user-facts'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import type { UserFact } from '@orbit/shared/types/user-fact'

async function fetchUserFacts(): Promise<UserFact[]> {
  const res = await fetch(API.userFacts.list)
  if (!res.ok) return []
  return res.json()
}

function ProUpgradeLink({ label }: Readonly<{ label: string }>) {
  return (
    <Link
      href="/upgrade"
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontFamily: 'var(--font-family-sans)',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--fg-1)',
        textDecoration: 'underline',
        textUnderlineOffset: 3,
        textDecorationColor: 'var(--hairline-strong)',
      }}
    >
      <Lock size={12} />
      {label}
    </Link>
  )
}

interface FactItemProps {
  fact: UserFact
  selectMode: boolean
  isSelected: boolean
  onToggleSelection: () => void
  onDelete: () => void
}

function FactItem({
  fact,
  selectMode,
  isSelected,
  onToggleSelection,
  onDelete,
}: Readonly<FactItemProps>) {
  const t = useTranslations()
  const category = fact.category ? normalizeUserFactCategory(fact.category) : null
  const categoryLabel = category ? category.toUpperCase() : null

  const Inner = (
    <>
      {selectMode && <SelectCheck selected={isSelected} size={16} />}
      <div className="flex-1 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {categoryLabel && (
          <span
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-2)',
              letterSpacing: '0.06em',
              padding: '2px 6px',
              borderRadius: 4,
              alignSelf: 'flex-start',
              boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
            }}
          >
            {categoryLabel}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            color: 'var(--fg-1)',
          }}
        >
          {fact.factText}
        </span>
      </div>
      {!selectMode && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="appearance-none border-0 bg-transparent cursor-pointer shrink-0"
          style={{ padding: 4 }}
        >
          <X size={14} strokeWidth={1.6} color="var(--fg-4)" />
        </button>
      )}
    </>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelection}
        className="appearance-none border-0 cursor-pointer w-full text-left flex items-center"
        style={{
          padding: '12px 20px',
          gap: 12,
          borderBottom: '1px solid var(--hairline)',
          background: isSelected ? 'var(--bg-sunk)' : 'transparent',
        }}
      >
        {Inner}
      </button>
    )
  }

  return (
    <div
      className="flex items-center"
      style={{
        padding: '12px 20px',
        gap: 12,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      {Inner}
    </div>
  )
}

export default function AiSettingsPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()
  const hasProAccess = profile?.hasProAccess ?? false
  const aiMemoryEnabled = hasProAccess && (profile?.aiMemoryEnabled ?? false)
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)

  const aiMemoryMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAiMemory({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.aiMemoryEnabled
      patchProfile({ aiMemoryEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiMemoryEnabled: context.previous })
      }
    },
  })

  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAiSummary({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
  })

  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: fetchUserFacts,
    enabled: hasProAccess,
    staleTime: 5 * 60 * 1000,
  })

  const facts = useMemo(
    () => (hasProAccess ? (factsQuery.data ?? []) : []),
    [hasProAccess, factsQuery.data],
  )

  const deleteMutation = useMutation({
    mutationFn: deleteUserFact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
    },
  })

  const [selectMode, setSelectMode] = useState(false)
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set())

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteUserFacts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      setSelectedFactIds(new Set())
      if (facts.length === 0) setSelectMode(false)
    },
  })

  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / USER_FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * USER_FACTS_PER_PAGE
    return facts.slice(start, start + USER_FACTS_PER_PAGE)
  }, [facts, factsPage])

  if (factsPage > totalFactsPages) {
    setFactsPage(totalFactsPages)
  }

  function toggleSelectMode() {
    setSelectMode(!selectMode)
    setSelectedFactIds(new Set())
  }

  function toggleFactSelection(id: string) {
    const next = new Set(selectedFactIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedFactIds(next)
  }

  function toggleSelectAll() {
    if (selectedFactIds.size === facts.length) {
      setSelectedFactIds(new Set())
    } else {
      setSelectedFactIds(new Set(facts.map((f) => f.id)))
    }
  }

  const factsTrailing = (() => {
    if (facts.length === 0) return undefined
    if (selectMode) return undefined
    return totalFactsPages > 1 ? (
      <span
        className="inline-flex items-center"
        style={{
          gap: 8,
          fontFamily: 'var(--font-family-mono)',
          fontSize: 11,
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {t('profile.facts.count', { n: factsPage, max: totalFactsPages })}
        <button
          type="button"
          disabled={factsPage === 1}
          onClick={() => setFactsPage((p) => p - 1)}
          aria-label={t('common.previousPage')}
          className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-40"
        >
          <ChevronLeft size={12} color="var(--fg-3)" />
        </button>
        <button
          type="button"
          disabled={factsPage === totalFactsPages}
          onClick={() => setFactsPage((p) => p + 1)}
          aria-label={t('common.nextPage')}
          className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-40"
        >
          <ChevronRight size={12} color="var(--fg-3)" />
        </button>
      </span>
    ) : undefined
  })()

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('aiSettings.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SectionLabel trailing={<ProBadge />}>{t('profile.aiMemory.title')}</SectionLabel>
        <SettingsRow label={t('profile.aiMemory.title')} accessory="none" divider={false}>
          {hasProAccess ? (
            <MonoToggle
              on={aiMemoryEnabled}
              onToggle={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
              ariaLabel={t('profile.aiMemory.title')}
              disabled={aiMemoryMutation.isPending}
            />
          ) : (
            <ProUpgradeLink label={t('common.proBadge')} />
          )}
        </SettingsRow>
        <SettingsDescription>{t('profile.aiMemory.description')}</SettingsDescription>

        <SectionLabel trailing={<ProBadge />}>{t('profile.aiSummary.title')}</SectionLabel>
        <SettingsRow label={t('profile.aiSummary.title')} accessory="none" divider={false}>
          {hasProAccess ? (
            <MonoToggle
              on={aiSummaryEnabled}
              onToggle={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              ariaLabel={t('profile.aiSummary.title')}
              disabled={aiSummaryMutation.isPending}
            />
          ) : (
            <ProUpgradeLink label={t('common.proBadge')} />
          )}
        </SettingsRow>
        <SettingsDescription>{t('profile.aiSummary.description')}</SettingsDescription>

        <SectionLabel trailing={factsTrailing}>{t('profile.facts.title')}</SectionLabel>

        {!hasProAccess && (
          <div style={{ padding: '14px 20px' }}>
            <ProUpgradeLink label={t('common.proBadge')} />
          </div>
        )}

        {hasProAccess && facts.length > 0 && (
          <div
            className="flex items-center justify-between"
            style={{
              padding: '8px 20px 12px',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: selectMode ? 'var(--fg-1)' : 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {selectMode
                ? `${selectedFactIds.size} ${t('profile.facts.select').toLowerCase()}`
                : `${facts.length}`}
            </span>
            <div className="inline-flex items-center" style={{ gap: 14 }}>
              {selectMode && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="appearance-none border-0 bg-transparent cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-family-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--fg-1)',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    textDecorationColor: 'var(--hairline-strong)',
                  }}
                >
                  {selectedFactIds.size === facts.length
                    ? t('profile.facts.deselectAll')
                    : t('profile.facts.selectAll')}
                </button>
              )}
              {selectMode && selectedFactIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => bulkDeleteMutation.mutate([...selectedFactIds])}
                  disabled={bulkDeleteMutation.isPending}
                  className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-40"
                  style={{
                    fontFamily: 'var(--font-family-sans)',
                    fontSize: 13,
                    fontStyle: 'italic',
                    color: 'var(--status-overdue)',
                  }}
                >
                  {t('profile.facts.deleteSelected', { n: selectedFactIds.size })}
                </button>
              )}
              <button
                type="button"
                onClick={toggleSelectMode}
                className="appearance-none border-0 bg-transparent cursor-pointer"
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontWeight: selectMode ? 400 : 600,
                  fontStyle: selectMode ? 'italic' : 'normal',
                  color: selectMode ? 'var(--fg-3)' : 'var(--fg-1)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  textDecorationColor: 'var(--hairline-strong)',
                }}
              >
                {selectMode ? t('profile.facts.cancel') : t('profile.facts.select')}
              </button>
            </div>
          </div>
        )}

        {hasProAccess && factsQuery.isLoading && (
          <div className="px-5 py-4 space-y-2">
            <div className="h-10 w-full rounded-md animate-pulse" style={{ background: 'var(--bg-elev)' }} />
            <div className="h-10 w-full rounded-md animate-pulse" style={{ background: 'var(--bg-elev)' }} />
          </div>
        )}

        {hasProAccess && !factsQuery.isLoading && facts.length === 0 && (
          <div
            className="flex flex-col items-center text-center"
            style={{ padding: '40px 24px', gap: 14 }}
          >
            <Orbit size={28} strokeWidth={1.4} color="var(--fg-3)" />
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontStyle: 'italic',
                color: 'var(--fg-3)',
                lineHeight: 1.5,
              }}
            >
              {t('profile.facts.empty')}
            </span>
          </div>
        )}

        {hasProAccess && !factsQuery.isLoading && facts.length > 0 && (
          <div>
            {pagedFacts.map((fact) => (
              <FactItem
                key={fact.id}
                fact={fact}
                selectMode={selectMode}
                isSelected={selectedFactIds.has(fact.id)}
                onToggleSelection={() => toggleFactSelection(fact.id)}
                onDelete={() => deleteMutation.mutate(fact.id)}
              />
            ))}
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
