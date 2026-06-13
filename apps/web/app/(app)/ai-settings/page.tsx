'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Lock,
  Satellite,
  Sparkles,
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
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { RadioGlyph } from '@/components/ui/select-check'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import { updateAiMemory, updateAiSummary } from '@/app/actions/profile'
import { bulkDeleteUserFacts, deleteUserFact } from '@/app/actions/user-facts'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import type { UserFact } from '@orbit/shared/types/user-fact'

async function fetchUserFacts(): Promise<UserFact[]> {
  const res = await fetch(API.userFacts.list)
  if (!res.ok) {
    throw new Error('Failed to load user facts')
  }
  return res.json()
}

function ProUpgradeLink({ label }: Readonly<{ label: string }>) {
  return (
    <Link href="/upgrade" className="chip">
      <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </Link>
  )
}

function ChipActionButton({
  onClick,
  disabled = false,
  destructive = false,
  children,
}: Readonly<{
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="chip disabled:opacity-40 disabled:cursor-not-allowed"
      style={destructive ? { color: 'var(--status-bad)' } : undefined}
    >
      {children}
    </button>
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
  const categoryLabel = category
    ? t(`profile.facts.${category}` as Parameters<typeof t>[0]).toUpperCase()
    : null

  const cardStyle: React.CSSProperties = {
    padding: '14px 16px',
    gap: 12,
    borderRadius: 16,
    background: isSelected
      ? 'rgba(var(--primary-rgb), 0.08)'
      : 'var(--bg-card)',
    boxShadow: isSelected
      ? 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)'
      : 'inset 0 0 0 1px var(--hairline)',
  }

  const Inner = (
    <>
      {selectMode && <RadioGlyph selected={isSelected} size={18} />}
      <div className="flex-1 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categoryLabel && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--fg-3)',
              letterSpacing: '0.06em',
              padding: '2px 7px',
              borderRadius: 999,
              alignSelf: 'flex-start',
              boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
            }}
          >
            {categoryLabel}
          </span>
        )}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.45,
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
          className="icon-btn shrink-0 hover:text-[var(--status-bad)]"
          style={{ width: 36, height: 36, margin: -6, color: 'var(--fg-3)' }}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
      )}
    </>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelection}
        aria-pressed={isSelected}
        className="appearance-none border-0 cursor-pointer w-full text-left flex items-center transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
        style={cardStyle}
      >
        {Inner}
      </button>
    )
  }

  return (
    <div className="flex items-center" style={cardStyle}>
      {Inner}
    </div>
  )
}

export default function AiSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
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
          fontFamily: 'var(--font-mono)',
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
          className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ width: 36, height: 36, color: 'var(--fg-3)' }}
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          disabled={factsPage === totalFactsPages}
          onClick={() => setFactsPage((p) => p + 1)}
          aria-label={t('common.nextPage')}
          className="icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ width: 36, height: 36, color: 'var(--fg-3)' }}
        >
          <ChevronRight size={18} strokeWidth={1.8} />
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
      <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
        <SectionLabel bottom={4} trailing={<ProBadge />}>
          {t('profile.sections.aiFeatures')}
        </SectionLabel>
        <SettingsRow
          icon={Brain}
          label={t('profile.aiMemory.title')}
          desc={t('profile.aiMemory.description')}
          accessory="none"
          divider={false}
        >
          {hasProAccess ? (
            <Switch
              on={aiMemoryEnabled}
              onToggle={() => aiMemoryMutation.mutate(!aiMemoryEnabled)}
              ariaLabel={t('profile.aiMemory.title')}
              disabled={aiMemoryMutation.isPending}
            />
          ) : (
            <ProUpgradeLink label={t('common.proBadge')} />
          )}
        </SettingsRow>
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
          divider={false}
        >
          {hasProAccess ? (
            <Switch
              on={aiSummaryEnabled}
              onToggle={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              ariaLabel={t('profile.aiSummary.title')}
              disabled={aiSummaryMutation.isPending}
            />
          ) : (
            <ProUpgradeLink label={t('common.proBadge')} />
          )}
        </SettingsRow>

        <SectionLabel trailing={factsTrailing}>{t('profile.facts.title')}</SectionLabel>

        {!hasProAccess && (
          <div style={{ padding: '4px 20px 14px' }}>
            <ProUpgradeLink label={t('common.proBadge')} />
          </div>
        )}

        {hasProAccess && facts.length > 0 && (
          <div
            className="flex items-center justify-between"
            style={{ padding: '0 20px 10px' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
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
            <div className="inline-flex items-center" style={{ gap: 8 }}>
              {selectMode && (
                <ChipActionButton onClick={toggleSelectAll}>
                  {selectedFactIds.size === facts.length
                    ? t('profile.facts.deselectAll')
                    : t('profile.facts.selectAll')}
                </ChipActionButton>
              )}
              {selectMode && selectedFactIds.size > 0 && (
                <ChipActionButton
                  destructive
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => bulkDeleteMutation.mutate([...selectedFactIds])}
                >
                  {t('profile.facts.deleteSelected', { n: selectedFactIds.size })}
                </ChipActionButton>
              )}
              <ChipActionButton onClick={toggleSelectMode}>
                {selectMode ? t('profile.facts.cancel') : t('profile.facts.select')}
              </ChipActionButton>
            </div>
          </div>
        )}

        {hasProAccess && factsQuery.isLoading && (
          <div className="px-5 space-y-2.5">
            <div
              className="w-full animate-pulse"
              style={{ height: 56, borderRadius: 16, background: 'var(--bg-elev)' }}
            />
            <div
              className="w-full animate-pulse"
              style={{ height: 56, borderRadius: 16, background: 'var(--bg-elev)' }}
            />
          </div>
        )}

        {hasProAccess && !factsQuery.isLoading && factsQuery.error && (
          <div
            className="flex flex-col items-center text-center animate-scale-in"
            style={{ padding: '40px 36px', gap: 18 }}
          >
            <SatelliteGlyph size={104} />
            <span
              role="alert"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: 'var(--status-bad)',
                lineHeight: 1.5,
                maxWidth: 320,
                textWrap: 'pretty',
              }}
            >
              {t('profile.facts.factsError')}
            </span>
            <PillButton
              fullWidth
              onClick={() => factsQuery.refetch()}
              className="mt-2"
            >
              {t('profile.facts.retry')}
            </PillButton>
          </div>
        )}

        {hasProAccess && !factsQuery.isLoading && !factsQuery.error && facts.length === 0 && (
          <div
            className="flex flex-col items-center text-center animate-scale-in"
            style={{ padding: '40px 36px', gap: 18 }}
          >
            <SatelliteGlyph size={104} />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: 'var(--fg-2)',
                lineHeight: 1.5,
                maxWidth: 320,
                textWrap: 'pretty',
              }}
            >
              {t('profile.facts.empty')}
            </span>
            <PillButton
              fullWidth
              onClick={() => router.push('/chat')}
              leading={<Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />}
              className="mt-2"
            >
              {t('summary.askAstra')}
            </PillButton>
          </div>
        )}

        {hasProAccess && !factsQuery.isLoading && !factsQuery.error && facts.length > 0 && (
          <div className="flex flex-col px-5 stagger-enter" style={{ gap: 10 }}>
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
