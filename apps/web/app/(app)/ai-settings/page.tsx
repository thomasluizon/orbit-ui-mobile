'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ShieldCheck,
  Trash2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle,
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
import { ProBadge } from '@/components/ui/pro-badge'
import { updateAiMemory, updateAiSummary } from '@/app/actions/profile'

// ---------------------------------------------------------------------------
// User facts types
// ---------------------------------------------------------------------------

interface UserFact {
  id: string
  factText: string
  category: string | null
}

async function fetchUserFacts(): Promise<UserFact[]> {
  const res = await fetch(API.userFacts.list)
  if (!res.ok) return []
  return res.json()
}

async function deleteUserFact(id: string): Promise<void> {
  const res = await fetch(`/api/user-facts/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete fact')
}

async function bulkDeleteUserFacts(ids: string[]): Promise<void> {
  const res = await fetch(API.userFacts.bulk, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to delete facts')
}

// ---------------------------------------------------------------------------
// Helpers (pure functions -- outer scope per SonarQube S7721)
// ---------------------------------------------------------------------------

  function factCategoryColor(category: string | null): string {
    switch (normalizeUserFactCategory(category)) {
      case 'preference':
        return 'text-primary bg-primary/10'
      case 'routine':
        return 'text-emerald-400 bg-emerald-400/10'
      case 'context':
      return 'text-blue-400 bg-blue-400/10'
    default:
      return 'text-text-secondary bg-surface-elevated'
  }
}

// ---------------------------------------------------------------------------
// Sub-components (reduce cognitive complexity per SonarQube S3776)
// ---------------------------------------------------------------------------

function ToggleSwitch({
  enabled,
  disabled,
  onToggle,
}: Readonly<{
  enabled: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <button
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
        enabled ? 'bg-primary' : 'bg-surface-elevated'
      }`}
      onClick={onToggle}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function ProUpgradeLink({ label }: Readonly<{ label: string }>) {
  return (
    <Link
      href="/upgrade"
      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
    >
      <Lock className="size-3.5" />
      {label}
    </Link>
  )
}

function FactItem({
  fact,
  selectMode,
  isSelected,
  onToggleSelection,
  onDelete,
}: Readonly<{
  fact: UserFact
  selectMode: boolean
  isSelected: boolean
  onToggleSelection: () => void
  onDelete: () => void
}>) {
  const content = (
    <>
      {selectMode && (
        <button
          className="shrink-0 mt-0.5"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelection()
          }}
        >
          <div
            className={`size-5 rounded-md border-2 transition-colors flex items-center justify-center ${
              isSelected
                ? 'bg-primary border-primary'
                : 'border-border'
            }`}
          >
            {isSelected && (
              <Check className="size-3 text-white" />
            )}
          </div>
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary">{fact.factText}</p>
        {fact.category && (
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${factCategoryColor(fact.category)}`}
          >
            {fact.category}
          </span>
        )}
      </div>
      {!selectMode && (
        <button
          className="shrink-0 p-1.5 text-text-muted hover:text-red-500 transition-colors rounded-full hover:bg-red-500/10"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </>
  )

  if (selectMode) {
    return (
      <button
        type="button"
        className={`flex items-start gap-3 rounded-2xl bg-background p-3 transition-colors w-full text-left cursor-pointer ${
          isSelected ? 'ring-1 ring-primary/40' : ''
        }`}
        onClick={onToggleSelection}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-background p-3 transition-colors">
      {content}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Settings Page
// ---------------------------------------------------------------------------

export default function AiSettingsPage() {
  const t = useTranslations()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()

  // --- AI Memory toggle ---
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

  // --- AI Summary toggle ---
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

  // --- User Facts ---
  const factsQuery = useQuery({
    queryKey: userFactKeys.lists(),
    queryFn: fetchUserFacts,
    staleTime: 5 * 60 * 1000,
  })

  const facts = factsQuery.data ?? []

  const deleteMutation = useMutation({
    mutationFn: deleteUserFact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteUserFacts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userFactKeys.all })
      setSelectedFactIds(new Set())
      if (facts.length === 0) setSelectMode(false)
    },
  })

  // Pagination
  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / USER_FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * USER_FACTS_PER_PAGE
    return facts.slice(start, start + USER_FACTS_PER_PAGE)
  }, [facts, factsPage])

  // Keep page in bounds when facts change
  useEffect(() => {
    if (factsPage > totalFactsPages) {
      setFactsPage(totalFactsPages)
    }
  }, [factsPage, totalFactsPages])

  // Selection mode
  const [selectMode, setSelectMode] = useState(false)
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set())

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

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('aiSettings.title')}
        </h1>
      </header>

      <div className="space-y-4">
        {/* AI Memory */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t('profile.aiMemory.title')}
              </h2>
              <ProBadge />
            </div>
            {profile?.hasProAccess ? (
              <ToggleSwitch
                enabled={!!profile?.aiMemoryEnabled}
                disabled={aiMemoryMutation.isPending}
                onToggle={() => aiMemoryMutation.mutate(!profile?.aiMemoryEnabled)}
              />
            ) : (
              <ProUpgradeLink label={t('common.proBadge')} />
            )}
          </div>
          <p className="text-sm text-text-secondary">
            {t('profile.aiMemory.description')}
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            <ShieldCheck className="size-3.5 inline-block align-text-bottom mr-1 text-emerald-400" />
            {t('profile.aiMemory.privacy')}
          </p>
          <p
            className={`text-xs font-medium ${
              profile?.aiMemoryEnabled ? 'text-primary' : 'text-text-muted'
            }`}
          >
            {profile?.aiMemoryEnabled ? t('profile.aiMemory.enabled') : t('profile.aiMemory.disabled')}
          </p>
        </div>

        {/* AI Summary */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t('profile.aiSummary.title')}
              </h2>
              <ProBadge />
            </div>
            {profile?.hasProAccess ? (
              <ToggleSwitch
                enabled={!!profile?.aiSummaryEnabled}
                disabled={aiSummaryMutation.isPending}
                onToggle={() => aiSummaryMutation.mutate(!profile?.aiSummaryEnabled)}
              />
            ) : (
              <ProUpgradeLink label={t('common.proBadge')} />
            )}
          </div>
          <p className="text-sm text-text-secondary">
            {t('profile.aiSummary.description')}
          </p>
          <p
            className={`text-xs font-medium ${
              profile?.aiSummaryEnabled ? 'text-primary' : 'text-text-muted'
            }`}
          >
            {profile?.aiSummaryEnabled ? t('profile.aiSummary.enabled') : t('profile.aiSummary.disabled')}
          </p>
        </div>

        {/* What Orbit Knows -- User Facts */}
        <div className="bg-surface rounded-[var(--radius-xl)] p-5 space-y-4 border border-border-muted shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t('profile.facts.title')}
              </h2>
              {facts.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-text-muted bg-surface-elevated">
                  {facts.length}
                </span>
              )}
            </div>
            {facts.length > 0 && (
              <button
                className={`text-xs font-semibold flex items-center gap-1 hover:underline ${
                  selectMode ? 'text-text-secondary' : 'text-text-muted'
                }`}
                onClick={toggleSelectMode}
              >
                {selectMode ? (
                  <X className="size-3" />
                ) : (
                  <CheckCircle className="size-3" />
                )}
                {selectMode ? t('profile.facts.cancel') : t('profile.facts.select')}
              </button>
            )}
          </div>

          {/* Bulk actions bar */}
          {selectMode && (
            <div className="flex items-center justify-between rounded-2xl bg-background border border-border p-3">
              <button
                className="text-xs font-semibold text-primary hover:underline"
                onClick={toggleSelectAll}
              >
                {selectedFactIds.size === facts.length ? t('profile.facts.deselectAll') : t('profile.facts.selectAll')}
              </button>
              <button
                disabled={selectedFactIds.size === 0}
                className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-full disabled:opacity-30 transition-all active:scale-95"
                onClick={() => bulkDeleteMutation.mutate([...selectedFactIds])}
              >
                {t('profile.facts.deleteSelected', { n: selectedFactIds.size })}
              </button>
            </div>
          )}

          {/* Loading state */}
          {factsQuery.isLoading && (
            <div className="space-y-3">
              <div className="h-10 w-full bg-surface-elevated rounded-2xl animate-pulse" />
              <div className="h-10 w-full bg-surface-elevated rounded-2xl animate-pulse" />
            </div>
          )}

          {/* Empty state */}
          {!factsQuery.isLoading && facts.length === 0 && (
            <div className="text-center py-6">
              <p className="text-text-muted text-sm">
                {t('profile.facts.empty')}
              </p>
            </div>
          )}

          {/* Facts list */}
          {!factsQuery.isLoading && facts.length > 0 && (
            <div className="space-y-2">
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

              {/* Pagination */}
              {totalFactsPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    disabled={factsPage === 1}
                    className="p-1.5 rounded-full text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors hover:bg-surface-elevated"
                    onClick={() => setFactsPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-xs font-semibold text-text-secondary tabular-nums">
                    {factsPage} / {totalFactsPages}
                  </span>
                  <button
                    disabled={factsPage === totalFactsPages}
                    className="p-1.5 rounded-full text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors hover:bg-surface-elevated"
                    onClick={() => setFactsPage((p) => p + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
