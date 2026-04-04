'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Clipboard,
  Check,
  Plus,
  Lock,
  Smartphone,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getTimezoneList } from '@orbit/shared/utils'
import { apiKeyKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { updateTimezone } from '@/app/actions/profile'

// ---------------------------------------------------------------------------
// API Keys types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAtUtc: string
  lastUsedAtUtc: string | null
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(API.apiKeys.list)
  if (!res.ok) return []
  return res.json()
}

async function createApiKey(name: string): Promise<{ id: string; key: string }> {
  const res = await fetch(API.apiKeys.create, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create API key')
  return res.json()
}

async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to revoke API key')
}

// ---------------------------------------------------------------------------
// Advanced Settings Page
// ---------------------------------------------------------------------------

export default function AdvancedPage() {
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()

  // --- Timezone ---
  const [timezoneList, setTimezoneList] = useState<string[]>([])
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [timezoneSaving, setTimezoneSaving] = useState(false)
  const [timezoneSaved, setTimezoneSaved] = useState(false)

  useEffect(() => {
    setTimezoneList(getTimezoneList())
  }, [])

  const filteredTimezones = useMemo(() => {
    const search = timezoneSearch.toLowerCase()
    if (!search) return timezoneList.slice(0, 50)
    return timezoneList.filter((tz) => tz.toLowerCase().includes(search)).slice(0, 100)
  }, [timezoneSearch, timezoneList])

  async function handleTimezoneChange(newTimezone: string) {
    setTimezoneSaving(true)
    setTimezoneSaved(false)
    try {
      await updateTimezone({ timeZone: newTimezone })
      patchProfile({ timeZone: newTimezone })
    } catch {
      // Error handled silently
    }
    setTimeout(() => {
      setTimezoneSaving(false)
      setTimezoneSaved(true)
      setTimezoneOpen(false)
      setTimezoneSearch('')
    }, 400)
  }

  // --- Widget Info ---
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  // --- API Keys ---
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: fetchApiKeys,
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const MAX_API_KEYS = 5
  const canCreateKey = apiKeys.length < MAX_API_KEYS

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: (data) => {
      setNewKeyValue(data.key)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })

  const revokeKeyMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setRevokingKeyId(null)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })

  // Connection instructions
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<'web' | 'desktop' | 'code'>('web')
  const [configCopied, setConfigCopied] = useState(false)

  const mcpConfigJson = `{
  "mcpServers": {
    "orbit": {
      "url": "https://api.useorbit.org/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard API not available
    }
  }

  async function copyConfig() {
    await copyToClipboard(mcpConfigJson)
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true })
  }

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label="Back to profile" // i18n
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {/* i18n: Advanced */}
          Advanced
        </h1>
      </header>

      <div className="space-y-4">
        {/* Timezone */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            {/* i18n: Timezone */}
            Timezone
          </h2>
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary flex items-center gap-1.5">
              {/* i18n: Current: */}
              Current:{' '}
              <span className="text-text-primary font-medium">
                {profile?.timeZone || 'Not set'}
              </span>
              {timezoneSaving && <Loader2 className="size-3.5 text-primary animate-spin" />}
              {timezoneSaved && <CheckCircle className="size-3.5 text-green-400" />}
            </p>
            <button
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              onClick={() => {
                setTimezoneOpen(!timezoneOpen)
                setTimezoneSaved(false)
              }}
            >
              {/* i18n: Edit / Close */}
              {timezoneOpen ? 'Close' : 'Edit'}
            </button>
          </div>
          {timezoneOpen && (
            <>
              <input
                type="text"
                value={timezoneSearch}
                onChange={(e) => setTimezoneSearch(e.target.value)}
                placeholder="Search timezones..." // i18n
                autoFocus
                className="w-full bg-background text-text-primary placeholder-text-muted rounded-2xl py-2.5 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="max-h-48 overflow-y-auto rounded-2xl bg-background border border-border">
                {filteredTimezones.map((tz) => (
                  <button
                    key={tz}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      tz === profile?.timeZone
                        ? 'bg-primary/20 text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                    }`}
                    onClick={() => handleTimezoneChange(tz)}
                  >
                    {tz}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-xs text-text-muted">
            {/* i18n */}
            Your timezone affects when habits reset and when you receive notifications.
          </p>
        </div>

        {/* Widget tip */}
        <button
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
          onClick={() => setShowWidgetInfo(true)}
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Smartphone className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">
              {/* i18n: Home Screen Widget */}
              Home Screen Widget
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              {/* i18n */}
              Add Orbit to your home screen
            </p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </button>

        {/* For Developers */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {/* i18n: Orbit MCP */}
                Orbit MCP
              </h2>
              <ProBadge />
            </div>
            {!profile?.hasProAccess && (
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
            {/* i18n */}
            Connect Orbit to Claude, ChatGPT, or any MCP-compatible AI assistant.
          </p>

          {profile?.hasProAccess && (
            <>
              {/* API Keys Sub-section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {/* i18n: API Keys */}
                    API Keys
                  </h4>
                  {canCreateKey && (
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                      onClick={() => {
                        setNewKeyName('')
                        setNewKeyValue(null)
                        setCreateKeyModalOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" />
                      {/* i18n: Create Key */}
                      Create Key
                    </button>
                  )}
                </div>

                <p className="text-xs text-text-muted">
                  {/* i18n */}
                  API keys let you connect external tools to your Orbit account.
                </p>

                {!canCreateKey && (
                  <p className="text-xs text-amber-400 font-medium">
                    {/* i18n */}
                    Maximum of {MAX_API_KEYS} keys reached. Revoke an existing key to create a new one.
                  </p>
                )}

                {/* Loading */}
                {apiKeysQuery.isLoading && (
                  <div className="space-y-2">
                    <div className="h-14 w-full bg-surface-elevated rounded-2xl animate-pulse" />
                    <div className="h-14 w-full bg-surface-elevated rounded-2xl animate-pulse" />
                  </div>
                )}

                {/* Error */}
                {apiKeysQuery.error && (
                  <p className="text-xs text-red-400">
                    {/* i18n */}
                    Failed to load API keys
                  </p>
                )}

                {/* Empty */}
                {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-text-muted text-sm">
                      {/* i18n */}
                      No API keys yet
                    </p>
                  </div>
                )}

                {/* Key list */}
                {apiKeys.length > 0 && (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="rounded-2xl bg-background p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {key.name}
                            </p>
                            <p className="text-xs font-mono text-text-muted mt-0.5">
                              {key.keyPrefix}...
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-text-muted">
                              {/* i18n: Created */}
                              Created {formatKeyDate(key.createdAtUtc)}
                            </p>
                            <p className="text-[10px] text-text-muted">
                              {/* i18n: Last used */}
                              Last used{' '}
                              {key.lastUsedAtUtc ? formatKeyDate(key.lastUsedAtUtc) : 'never'}
                            </p>
                          </div>
                        </div>

                        {revokingKeyId !== key.id ? (
                          <div className="flex justify-end">
                            <button
                              className="text-xs font-semibold text-text-muted hover:text-red-500 transition-colors"
                              onClick={() => setRevokingKeyId(key.id)}
                            >
                              {/* i18n: Revoke */}
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between rounded-xl bg-red-500/5 border border-red-500/20 px-3 py-2">
                            <p className="text-xs text-red-400">
                              {/* i18n */}
                              Are you sure?
                            </p>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <button
                                className="text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                                onClick={() => setRevokingKeyId(null)}
                              >
                                {/* i18n: Cancel */}
                                Cancel
                              </button>
                              <button
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                                onClick={() => revokeKeyMutation.mutate(key.id)}
                              >
                                {/* i18n: Confirm */}
                                Confirm
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connection Instructions */}
              <div className="border-t border-border pt-4 space-y-3">
                <button
                  className="flex items-center justify-between w-full group"
                  onClick={() => setInstructionsOpen(!instructionsOpen)}
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors">
                    {/* i18n: Connection Instructions */}
                    Connection Instructions
                  </h4>
                  <ChevronDown
                    className={`size-4 text-text-muted transition-transform duration-200 ${
                      instructionsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {instructionsOpen && (
                  <>
                    {/* Tab buttons */}
                    <div className="flex gap-2">
                      {(
                        [
                          { value: 'web', label: 'Claude Web' },
                          { value: 'desktop', label: 'Claude Desktop' },
                          { value: 'code', label: 'Claude Code' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.value}
                          className={`px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${
                            activeConfigTab === tab.value
                              ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                              : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                          }`}
                          onClick={() => setActiveConfigTab(tab.value)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {activeConfigTab === 'web' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-text-muted">
                          {/* i18n */}
                          Connect via OAuth -- no API key needed.
                        </p>
                        <ol className="text-xs text-text-secondary space-y-2 list-decimal list-inside">
                          <li>Go to claude.ai Settings</li>
                          <li>Click &quot;Connected Apps&quot;</li>
                          <li>Click &quot;Add Integration&quot;</li>
                          <li>Paste the URL below</li>
                        </ol>
                        <div className="relative">
                          <pre className="rounded-[var(--radius-lg)] bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">
                            https://api.useorbit.org/mcp
                          </pre>
                          <button
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
                            onClick={() => copyToClipboard('https://api.useorbit.org/mcp')}
                          >
                            <Clipboard className="size-4" />
                          </button>
                        </div>
                        <p className="text-xs text-text-muted italic">
                          {/* i18n */}
                          No API key required for Claude Web.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-text-muted">
                          {/* i18n */}
                          Add this to your MCP configuration file:
                        </p>
                        <div className="relative">
                          <pre className="rounded-[var(--radius-lg)] bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed whitespace-pre">
                            {mcpConfigJson}
                          </pre>
                          <button
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
                            onClick={copyConfig}
                          >
                            {configCopied ? (
                              <Check className="size-4 text-emerald-400" />
                            ) : (
                              <Clipboard className="size-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-text-muted italic">
                          {/* i18n */}
                          Replace YOUR_API_KEY with an actual API key from above.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Widget Info Overlay */}
      <AppOverlay
        open={showWidgetInfo}
        onOpenChange={setShowWidgetInfo}
        title="Home Screen Widget" // i18n
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n: How to add */}
              How to add
            </h3>
            <ol className="text-sm text-text-secondary leading-relaxed space-y-2">
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">1.</span>
                <span>Open this app in your mobile browser</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">2.</span>
                <span>Tap &quot;Share&quot; then &quot;Add to Home Screen&quot;</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">3.</span>
                <span>Orbit will appear as a native-like app</span>
              </li>
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1.5">
              {/* i18n: Features */}
              Features
            </h3>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5">
              <li className="flex gap-2 items-start">
                <CheckCircle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>Quick habit check-off from home screen</span>
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>Today&apos;s progress at a glance</span>
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>Upcoming habits list</span>
              </li>
              <li className="flex gap-2 items-start">
                <CheckCircle className="size-4 text-primary shrink-0 mt-0.5" />
                <span>Auto-refreshes throughout the day</span>
              </li>
            </ul>
          </div>
        </div>
      </AppOverlay>

      {/* Create API Key Modal */}
      <AppOverlay
        open={createKeyModalOpen}
        onOpenChange={setCreateKeyModalOpen}
        title="Create API Key" // i18n
      >
        {newKeyValue ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {/* i18n */}
              Copy your API key now. You won&apos;t be able to see it again.
            </p>
            <div className="relative">
              <pre className="rounded-[var(--radius-lg)] bg-background border border-border p-4 text-xs font-mono text-text-primary break-all whitespace-pre-wrap">
                {newKeyValue}
              </pre>
              <button
                className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 text-text-secondary hover:text-text-primary transition-all"
                onClick={() => copyToClipboard(newKeyValue)}
              >
                <Clipboard className="size-4" />
              </button>
            </div>
            <button
              className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors"
              onClick={() => setCreateKeyModalOpen(false)}
            >
              {/* i18n: Done */}
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {/* i18n */}
              Give your API key a name to help you identify it later.
            </p>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Claude Desktop" // i18n
              className="w-full bg-surface-elevated text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            {createKeyMutation.error && (
              <p className="text-xs text-red-400 text-center">
                {createKeyMutation.error instanceof Error
                  ? createKeyMutation.error.message
                  : 'Failed to create key'}
              </p>
            )}
            <button
              className="w-full py-3 rounded-2xl bg-primary text-text-inverse font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              disabled={!newKeyName.trim() || createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate(newKeyName.trim())}
            >
              {/* i18n: Create / Creating... */}
              {createKeyMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        )}
      </AppOverlay>
    </div>
  )
}
