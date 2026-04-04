'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ShieldCheck,
  Trash2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userFactKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
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
// AI Settings Page
// ---------------------------------------------------------------------------

export default function AiSettingsPage() {
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
  const FACTS_PER_PAGE = 5
  const [factsPage, setFactsPage] = useState(1)
  const totalFactsPages = useMemo(
    () => Math.max(1, Math.ceil(facts.length / FACTS_PER_PAGE)),
    [facts.length],
  )
  const pagedFacts = useMemo(() => {
    const start = (factsPage - 1) * FACTS_PER_PAGE
    return facts.slice(start, start + FACTS_PER_PAGE)
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

  function factCategoryColor(category: string | null): string {
    switch (category?.toLowerCase()) {
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

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label="Back to profile"
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          AI Features
        </h1>
      </header>

      <div className="space-y-4">
        {/* AI Memory */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                AI Memory
              </h2>
              <ProBadge />
            </div>
            {profile?.hasProAccess ? (
              <button
                disabled={aiMemoryMutation.isPending}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
                  profile?.aiMemoryEnabled ? 'bg-primary' : 'bg-surface-elevated'
                }`}
                onClick={() => aiMemoryMutation.mutate(!profile?.aiMemoryEnabled)}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    profile?.aiMemoryEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            ) : (
              <Link
                href="/upgrade"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
              >
                <Lock className="size-3.5" />
                PRO
              </Link>
            )}
          </div>
          <p className="text-sm text-text-secondary">
            Orbit remembers what you share in conversations to give more personalized advice.
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            <ShieldCheck className="size-3.5 inline-block align-text-bottom mr-1 text-emerald-400" />
            Your data is never shared with third parties or used to train models.
          </p>
          <p
            className={`text-xs font-medium ${
              profile?.aiMemoryEnabled ? 'text-primary' : 'text-text-muted'
            }`}
          >
            {profile?.aiMemoryEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>

        {/* AI Summary */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                AI Daily Summary
              </h2>
              <ProBadge />
            </div>
            {profile?.hasProAccess ? (
              <button
                disabled={aiSummaryMutation.isPending}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
                  profile?.aiSummaryEnabled ? 'bg-primary' : 'bg-surface-elevated'
                }`}
                onClick={() => aiSummaryMutation.mutate(!profile?.aiSummaryEnabled)}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    profile?.aiSummaryEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            ) : (
              <Link
                href="/upgrade"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
              >
                <Lock className="size-3.5" />
                PRO
              </Link>
            )}
          </div>
          <p className="text-sm text-text-secondary">
            Get a personalized AI-generated summary of your day based on your habit logs.
          </p>
          <p
            className={`text-xs font-medium ${
              profile?.aiSummaryEnabled ? 'text-primary' : 'text-text-muted'
            }`}
          >
            {profile?.aiSummaryEnabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>

        {/* What Orbit Knows -- User Facts */}
        <div className="bg-surface rounded-[var(--radius-xl)] p-5 space-y-4 border border-border-muted shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                What Orbit Knows
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
                  <Check className="size-3" />
                )}
                {selectMode ? 'Cancel' : 'Select'}
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
                {selectedFactIds.size === facts.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                disabled={selectedFactIds.size === 0}
                className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-full disabled:opacity-30 transition-all active:scale-95"
                onClick={() => bulkDeleteMutation.mutate([...selectedFactIds])}
              >
                Delete {selectedFactIds.size} selected
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
                No memories yet. Chat with Orbit to start building your profile.
              </p>
            </div>
          )}

          {/* Facts list */}
          {!factsQuery.isLoading && facts.length > 0 && (
            <div className="space-y-2">
              {pagedFacts.map((fact) => (
                <div
                  key={fact.id}
                  className={`flex items-start gap-3 rounded-2xl bg-background p-3 transition-colors ${
                    selectMode && selectedFactIds.has(fact.id) ? 'ring-1 ring-primary/40' : ''
                  }`}
                  onClick={selectMode ? () => toggleFactSelection(fact.id) : undefined}
                >
                  {selectMode && (
                    <button
                      className="shrink-0 mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFactSelection(fact.id)
                      }}
                    >
                      <div
                        className={`size-5 rounded-md border-2 transition-colors flex items-center justify-center ${
                          selectedFactIds.has(fact.id)
                            ? 'bg-primary border-primary'
                            : 'border-border'
                        }`}
                      >
                        {selectedFactIds.has(fact.id) && (
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
                      onClick={() => deleteMutation.mutate(fact.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
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
