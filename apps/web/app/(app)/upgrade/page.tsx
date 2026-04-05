'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import {
  ArrowLeft, Loader2, BadgeCheck, Sparkles, CreditCard,
  Flame, MessageSquare, Palette, ShieldCheck, BarChart3,
  AlertTriangle, Download, CheckCircle2, Clock, Check, X as XIcon,
  Megaphone, Tag, Info,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess, useTrialExpired, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'
import { useSubscriptionPlans, formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { useBilling } from '@/hooks/use-billing'
import { API } from '@orbit/shared/api'
import { getErrorMessage } from '@orbit/shared/utils'

const trialExpiredFeatures = [
  'trial.expired.unlimitedHabits',
  'trial.expired.aiChat',
  'trial.expired.allColors',
  'trial.expired.aiSummary',
  'trial.expired.subHabits',
  'trial.expired.retrospective',
]

const proFeatures = [
  { key: 'unlimited', Icon: Flame },
  { key: 'ai', Icon: MessageSquare },
  { key: 'themes', Icon: Palette },
  { key: 'adFree', Icon: ShieldCheck },
]

const yearlyExtraFeatures = [
  { key: 'retrospective', Icon: BarChart3 },
]

interface FeatureRow {
  key: string
  Icon: React.ComponentType<{ className?: string }>
  type: 'boolean' | 'text'
  freeEnabled?: boolean
  proEnabled?: boolean
}

interface FeatureCategory {
  category: string
  features: FeatureRow[]
}

const featureCategories: FeatureCategory[] = [
  {
    category: 'habits',
    features: [
      { key: 'habits', type: 'text', Icon: Flame },
      { key: 'subHabits', type: 'boolean', Icon: Flame, freeEnabled: false, proEnabled: true },
    ],
  },
  {
    category: 'ai',
    features: [
      { key: 'ai', type: 'text', Icon: MessageSquare },
      { key: 'aiMemory', type: 'boolean', Icon: MessageSquare, freeEnabled: false, proEnabled: true },
      { key: 'summary', type: 'boolean', Icon: MessageSquare, freeEnabled: false, proEnabled: true },
      { key: 'slipAlerts', type: 'boolean', Icon: ShieldCheck, freeEnabled: false, proEnabled: true },
    ],
  },
  {
    category: 'insights',
    features: [
      { key: 'retrospective', type: 'boolean', Icon: BarChart3, freeEnabled: false, proEnabled: true },
      { key: 'achievements', type: 'boolean', Icon: Flame, freeEnabled: false, proEnabled: true },
    ],
  },
  {
    category: 'personalization',
    features: [
      { key: 'colors', type: 'text', Icon: Palette },
      { key: 'calendarImport', type: 'boolean', Icon: Flame, freeEnabled: false, proEnabled: true },
      { key: 'adFree', type: 'boolean', Icon: ShieldCheck, freeEnabled: false, proEnabled: true },
    ],
  },
]

function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function invoiceStatusClassName(status: string): string {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
  if (status === 'open') return 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
  return 'bg-surface-elevated text-text-muted border border-border-muted'
}

function FeatureBooleanCell({ enabled, className }: Readonly<{ enabled: boolean | undefined; className: string }>) {
  if (enabled) return <Check className={`size-4 ${className}`} />
  return <XIcon className="size-4 text-text-muted/40" />
}

function UsageStats({ usagePercent, usageUrgent, profile, t }: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-3">
      <h3 className="form-label">{t('upgrade.billing.usage.title')}</h3>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-primary">{t('upgrade.billing.usage.aiMessages')}</span>
          <span className={`text-sm font-semibold ${usageUrgent ? 'text-amber-400' : 'text-text-primary'}`}>
            {t('upgrade.billing.usage.aiMessagesOf', {
              used: profile?.aiMessagesUsed ?? 0,
              limit: profile?.aiMessagesLimit ?? 0,
            })}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-elevated">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${usageUrgent ? 'bg-amber-400' : 'bg-primary'}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function FeatureTooltip({ text }: Readonly<{ text: string }>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="shrink-0 p-0.5 rounded-full text-text-muted/60 hover:text-text-secondary transition-colors"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-3 py-2.5 max-w-[260px] bg-surface-elevated border border-border rounded-xl shadow-lg">
          <p className="text-xs text-text-secondary leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

function formatBillingDate(isoDate: string, locale: string, dateFnsLocale: Locale): string {
  return format(parseISO(isoDate), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateFnsLocale })
}

function invoiceReasonLabelFn(reason: string, t: ReturnType<typeof useTranslations>): string {
  const reasons: Record<string, string> = {
    subscription_create: t('upgrade.billing.invoices.reasonCreate'),
    subscription_cycle: t('upgrade.billing.invoices.reasonCycle'),
    subscription_update: t('upgrade.billing.invoices.reasonUpdate'),
    manual: t('upgrade.billing.invoices.reasonManual'),
  }
  return reasons[reason] ?? reason
}

function invoiceStatusLabelFn(status: string, t: ReturnType<typeof useTranslations>): string {
  const statuses: Record<string, string> = {
    paid: t('upgrade.billing.invoices.statusPaid'),
    open: t('upgrade.billing.invoices.statusOpen'),
    void: t('upgrade.billing.invoices.statusVoid'),
  }
  return statuses[status] ?? status
}

export default function UpgradePage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const { plans, isLoading: isLoadingPlans, isError: isPlansError, refetch: refetchPlans, discountedAmount } = useSubscriptionPlans()

  const isBillingEnabled = hasProAccess && !profile?.isTrialActive
  const { billing, isLoading: isBillingLoading, isError: isBillingError, refetch: refetchBilling } = useBilling(isBillingEnabled)

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalError, setPortalError] = useState('')

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100))
  }, [profile])
  const usageUrgent = usagePercent > 80


  const handleCheckout = useCallback(async (interval: 'monthly' | 'yearly') => {
    setCheckoutLoading(interval)
    setCheckoutError('')
    try {
      const res = await fetch(API.subscription.checkout, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Failed with status ${res.status}`)
      }
      const data = await res.json()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setCheckoutError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setCheckoutLoading(null)
    }
  }, [t])

  const handleOpenPortal = useCallback(async () => {
    setPortalError('')
    try {
      const res = await fetch(API.subscription.portal, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Failed with status ${res.status}`)
      }
      const data = await res.json()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }, [t])

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link href="/profile" className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors">
          <ArrowLeft className="size-5 text-text-primary" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('upgrade.title')}
        </h1>
      </header>

      {/* Already Pro: Billing Dashboard */}
      {hasProAccess && !profile?.isTrialActive ? (
        <div className="space-y-3">
          {/* Loading */}
          {isBillingLoading && (
            <>
              <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-full bg-surface-elevated skeleton-shimmer shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-28 bg-surface-elevated rounded skeleton-shimmer" />
                    <div className="h-3 w-44 bg-surface-elevated rounded skeleton-shimmer" />
                  </div>
                </div>
              </div>
              <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-3">
                <div className="h-3 w-20 bg-surface-elevated rounded skeleton-shimmer" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-24 bg-surface-elevated rounded skeleton-shimmer" />
                    <div className="h-3.5 w-16 bg-surface-elevated rounded skeleton-shimmer" />
                  </div>
                  <div className="h-1.5 w-full bg-surface-elevated rounded-full skeleton-shimmer" />
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {isBillingError && !billing && !isBillingLoading && (
            <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted p-8 text-center space-y-3">
              <AlertTriangle className="size-8 text-text-muted mx-auto" />
              <p className="text-sm text-text-secondary">{t('upgrade.billing.error')}</p>
              <button className="text-primary text-sm font-semibold hover:underline" onClick={() => refetchBilling()}>
                {t('upgrade.billing.retry')}
              </button>
            </div>
          )}

          {/* Loaded: billing data available (Stripe Pro) */}
          {billing && (
            <>
              {/* Plan card */}
              <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/15 rounded-full size-12 flex items-center justify-center shrink-0">
                    <BadgeCheck className="size-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-text-primary">
                        {billing.interval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
                      </h2>
                      {billing.cancelAtPeriodEnd && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          {t('upgrade.billing.plan.canceledBadge')}
                        </span>
                      )}
                      {!billing.cancelAtPeriodEnd && billing.status === 'past_due' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                          {t('upgrade.billing.plan.pastDue')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {billing.cancelAtPeriodEnd
                        ? t('upgrade.billing.plan.canceledHint', { date: formatBillingDate(billing.currentPeriodEnd, locale, dateFnsLocale) })
                        : t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(billing.currentPeriodEnd, locale, dateFnsLocale) })}
                      {billing.amountPerPeriod > 0 && (
                        <span className="text-text-muted">
                          {' '}&middot;{' '}{formatPrice(billing.amountPerPeriod, billing.currency)}
                          {billing.interval === 'yearly' ? t('upgrade.plans.yearly.period') : t('upgrade.plans.monthly.period')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment method */}
              {billing.paymentMethod && (
                <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <CreditCard className="size-8 text-text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">
                          {t('upgrade.billing.payment.card', {
                            brand: formatCardBrand(billing.paymentMethod.brand),
                            last4: billing.paymentMethod.last4,
                          })}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {t('upgrade.billing.payment.expires', {
                            month: String(billing.paymentMethod.expMonth).padStart(2, '0'),
                            year: billing.paymentMethod.expYear,
                          })}
                        </p>
                      </div>
                    </div>
                    <button
                      className="px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-semibold text-text-secondary bg-surface-elevated border border-border hover:bg-surface-overlay transition-colors shrink-0"
                      onClick={handleOpenPortal}
                    >
                      {t('upgrade.billing.payment.change')}
                    </button>
                  </div>
                </div>
              )}

              <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile ?? null} t={t} />

              {/* Invoice history */}
              {billing.recentInvoices.length > 0 && (
                <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] overflow-hidden">
                  <div className="p-5 pb-3">
                    <h3 className="form-label">{t('upgrade.billing.invoices.title')}</h3>
                  </div>
                  <div className="divide-y divide-border-muted">
                    {billing.recentInvoices.map((invoice) => (
                      <div key={invoice.id} className="px-5 py-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-text-primary font-medium">
                              {formatBillingDate(invoice.date, locale, dateFnsLocale)}
                            </span>
                            <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-surface-elevated text-text-muted border border-border-muted">
                              {invoiceReasonLabelFn(invoice.billingReason, t)}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${invoiceStatusClassName(invoice.status)}`}
                          >
                            {invoiceStatusLabelFn(invoice.status, t)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-text-primary">
                            {formatPrice(invoice.amountPaid, invoice.currency)}
                          </span>
                          {(invoice.invoicePdf ?? invoice.hostedInvoiceUrl) && (
                            <a
                              href={invoice.invoicePdf ?? invoice.hostedInvoiceUrl ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-text-muted hover:text-text-primary transition-colors"
                              title={t('upgrade.billing.invoices.download')}
                            >
                              <Download className="size-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manage subscription */}
              <div className="space-y-2 pt-1">
                <button
                  className="w-full py-3 rounded-[var(--radius-xl)] bg-surface-elevated text-text-primary text-sm font-semibold border border-border hover:bg-surface-overlay transition-all duration-200 active:scale-[0.98]"
                  onClick={handleOpenPortal}
                >
                  {t('upgrade.billing.actions.manage')}
                </button>
                <p className="text-xs text-text-muted text-center">{t('upgrade.billing.actions.manageHint')}</p>
                {portalError && <p className="text-xs text-red-400 text-center">{portalError}</p>}
              </div>
            </>
          )}

          {/* Loaded: no billing data (lifetime Pro or no Stripe subscription) */}
          {!isBillingLoading && !isBillingError && !billing && (
            <>
              {/* Plan card */}
              <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/15 rounded-full size-12 flex items-center justify-center shrink-0">
                    <Sparkles className="size-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-text-primary">
                      {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetime') : t('upgrade.alreadyPro')}
                    </h2>
                    <p className="text-sm text-text-secondary mt-0.5">
                      {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetimeHint') : t('upgrade.manageHint')}
                    </p>
                  </div>
                </div>
              </div>

              <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile ?? null} t={t} />
            </>
          )}
        </div>
      ) : (
        <>
          {/* Trial countdown banner */}
          {profile?.isTrialActive && (
            <div
              className={`rounded-[var(--radius-xl)] p-4 mb-4 flex items-center gap-3 border ${
                trialUrgent
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-primary/10 border-primary/20'
              }`}
            >
              <Clock className={`size-5 shrink-0 ${trialUrgent ? 'text-amber-400' : 'text-primary'}`} />
              <p className={`text-sm font-medium ${trialUrgent ? 'text-amber-400' : 'text-text-primary'}`}>
                {trialDaysLeft === 0
                  ? t('trial.banner.lastDay')
                  : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
              </p>
            </div>
          )}

          {/* Trial expired emotional section */}
          {trialExpired && (
            <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span className="text-sm font-bold text-text-primary">{t('trial.expired.title')}</span>
              </div>
              <p className="form-label">
                {t('trial.expired.dontLose')}
              </p>
              <ul className="space-y-2">
                {trialExpiredFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <CheckCircle2 className="size-4 text-primary shrink-0" />
                    <span className="text-sm text-text-secondary">{t(feature)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PRICING PLAN CARDS */}

          {/* Loading skeletons */}
          {isLoadingPlans && (
            <div className="space-y-3 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-[var(--radius-xl)] p-5 border border-border-muted">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-4 w-20 bg-surface-elevated rounded skeleton-shimmer" />
                    <div className="h-6 w-16 bg-surface-elevated rounded-full skeleton-shimmer" />
                  </div>
                  <div className="space-y-2.5 mb-4">
                    <div className="h-3 w-3/4 bg-surface-elevated rounded skeleton-shimmer" />
                    <div className="h-3 w-1/2 bg-surface-elevated rounded skeleton-shimmer" />
                    <div className="h-3 w-2/3 bg-surface-elevated rounded skeleton-shimmer" />
                  </div>
                  <div className="h-10 w-full bg-surface-elevated rounded-[var(--radius-lg)] skeleton-shimmer" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {isPlansError && !plans && !isLoadingPlans && (
            <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted p-8 text-center space-y-3 mb-6">
              <AlertTriangle className="size-8 text-text-muted mx-auto" />
              <p className="text-sm text-text-secondary">{t('upgrade.plans.error')}</p>
              <button className="text-primary text-sm font-semibold hover:underline" onClick={() => refetchPlans()}>
                {t('upgrade.plans.retry')}
              </button>
            </div>
          )}

          {/* Plan cards */}
          {plans && (
            <div className="space-y-3 mb-6">
              {/* FREE PLAN */}
              <div className="rounded-[var(--radius-xl)] border border-dashed border-border-emphasis bg-surface-ground p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">
                    {t('upgrade.plans.free.name')}
                  </h3>
                  <span className="text-lg font-bold text-text-muted">
                    {formatPrice(0, plans.currency)}
                  </span>
                </div>
                <ul className="space-y-2 mb-4">
                  <li className="flex items-center gap-2.5">
                    <Flame className="size-3.5 text-text-muted/60 shrink-0" />
                    <span className="text-xs text-text-muted">{t('upgrade.plans.free.features.habits')}</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <MessageSquare className="size-3.5 text-text-muted/60 shrink-0" />
                    <span className="text-xs text-text-muted">{t('upgrade.plans.free.features.ai')}</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Palette className="size-3.5 text-text-muted/60 shrink-0" />
                    <span className="text-xs text-text-muted">{t('upgrade.plans.free.features.theme')}</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Megaphone className="size-3.5 text-amber-400/80 shrink-0" />
                    <span className="text-xs text-amber-400/80 font-medium">{t('upgrade.plans.free.features.ads')}</span>
                  </li>
                </ul>
                {!hasProAccess && (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-[var(--radius-lg)] bg-surface text-text-muted text-xs font-semibold border border-border-muted cursor-default opacity-60"
                  >
                    {t('upgrade.plans.free.cta')}
                  </button>
                )}
              </div>

              {/* PRO MONTHLY */}
              <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-text-primary">
                    {t('upgrade.plans.monthly.name')}
                  </h3>
                </div>
                <div className="mb-4">
                  {plans.couponPercentOff ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-extrabold text-text-primary">
                        {formatPrice(discountedAmount(plans.monthly.unitAmount), plans.currency)}
                        <span className="text-sm font-semibold text-text-secondary">{t('upgrade.plans.monthly.period')}</span>
                      </span>
                      <span className="text-sm text-text-muted line-through">
                        {formatPrice(plans.monthly.unitAmount, plans.currency)}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        {t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline">
                      <span className="text-2xl font-extrabold text-text-primary">
                        {formatPrice(plans.monthly.unitAmount, plans.currency)}
                        <span className="text-sm font-semibold text-text-secondary">{t('upgrade.plans.monthly.period')}</span>
                      </span>
                    </div>
                  )}
                </div>
                <ul className="space-y-2 mb-4">
                  {proFeatures.map((feat) => (
                    <li key={feat.key} className="flex items-center gap-2.5">
                      <feat.Icon className="size-3.5 text-primary/70 shrink-0" />
                      <span className="text-xs text-text-secondary">{t(`upgrade.plans.proFeatures.${feat.key}`)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className="w-full py-3 rounded-[var(--radius-lg)] bg-surface-elevated text-text-primary text-sm font-semibold border border-border hover:bg-surface-overlay transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={!!checkoutLoading}
                  onClick={() => handleCheckout('monthly')}
                >
                  {checkoutLoading === 'monthly' && <Loader2 className="size-4 animate-spin" />}
                  {t('upgrade.plans.monthly.cta')}
                </button>
              </div>

              {/* PRO YEARLY (Recommended) */}
              <div className="relative rounded-[var(--radius-xl)] border border-primary/30 bg-surface p-5 shadow-[var(--shadow-glow-sm)]">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/20">
                    {t('upgrade.plans.yearly.recommended')}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    {t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-text-primary mb-1">
                  {t('upgrade.plans.yearly.name')}
                </h3>
                <div className="mb-1">
                  {plans.couponPercentOff ? (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-extrabold text-text-primary">
                        {formatPrice(discountedAmount(plans.yearly.unitAmount), plans.currency)}
                        <span className="text-sm font-semibold text-text-secondary">{t('upgrade.plans.yearly.period')}</span>
                      </span>
                      <span className="text-sm text-text-muted line-through">
                        {formatPrice(plans.yearly.unitAmount, plans.currency)}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        {t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline">
                      <span className="text-2xl font-extrabold text-text-primary">
                        {formatPrice(plans.yearly.unitAmount, plans.currency)}
                        <span className="text-sm font-semibold text-text-secondary">{t('upgrade.plans.yearly.period')}</span>
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-text-muted mb-4">
                  {plans.couponPercentOff
                    ? t('upgrade.plans.equivalent', { price: formatPrice(monthlyEquivalent(discountedAmount(plans.yearly.unitAmount)), plans.currency) })
                    : t('upgrade.plans.equivalent', { price: formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency) })}
                </p>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-primary/[0.04] border border-primary/10 px-3 py-2">
                    <BadgeCheck className="size-4 text-primary/50 shrink-0" />
                    <span className="text-xs text-text-secondary">{t('upgrade.plans.yearly.includesMonthly')}</span>
                  </div>
                  <ul className="space-y-2">
                    {yearlyExtraFeatures.map((feat) => (
                      <li key={feat.key} className="flex items-center gap-2.5">
                        <feat.Icon className="size-3.5 text-primary/70 shrink-0" />
                        <span className="text-xs text-text-secondary">{t(`upgrade.plans.proFeatures.${feat.key}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {plans.couponPercentOff && (
                  <p className="text-[10px] text-emerald-400/70 mb-3 flex items-center gap-1.5">
                    <Tag className="size-3 shrink-0" />
                    {t('upgrade.plans.coupon.appliedNote')}
                  </p>
                )}
                <button
                  className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] shadow-[var(--shadow-glow-lg)] disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={!!checkoutLoading}
                  onClick={() => handleCheckout('yearly')}
                >
                  {checkoutLoading === 'yearly' && <Loader2 className="size-4 animate-spin" />}
                  {t('upgrade.plans.yearly.cta')}
                </button>
              </div>
            </div>
          )}

          {checkoutError && (
            <p className="text-xs text-red-400 text-center">{checkoutError}</p>
          )}

          {/* Feature comparison - grouped by category */}
          <div className="space-y-4 mb-6">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('upgrade.feature')}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-center w-16">{t('upgrade.free')}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary text-center w-16">{t('common.proBadge')}</span>
            </div>

            {/* Category groups */}
            {featureCategories.map((group) => (
              <div key={group.category} className="space-y-1.5">
                {/* Category header */}
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                    {t(`upgrade.categories.${group.category}`)}
                  </span>
                </div>

                {/* Feature rows */}
                {group.features.map((feat) => (
                  <div
                    key={feat.key}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 bg-surface rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] py-3 px-4 items-center"
                  >
                    {/* Feature label with icon and info popover */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <feat.Icon className="size-4 text-text-muted shrink-0" />
                      <span className="text-sm text-text-primary truncate">{t(`upgrade.features.${feat.key}.label`)}</span>
                      <FeatureTooltip text={t(`upgrade.features.${feat.key}.tooltip`)} />
                    </div>

                    {/* Free value */}
                    <div className="w-16 flex justify-center">
                      {feat.type === 'boolean'
                        ? <FeatureBooleanCell enabled={feat.freeEnabled} className="text-text-muted" />
                        : <span className="text-xs text-text-muted text-center">{t(`upgrade.features.${feat.key}.free`)}</span>}
                    </div>

                    {/* Pro value */}
                    <div className="w-16 flex justify-center">
                      {feat.type === 'boolean'
                        ? <FeatureBooleanCell enabled={feat.proEnabled} className="text-primary" />
                        : <span className="text-xs text-primary font-semibold text-center">{t(`upgrade.features.${feat.key}.pro`)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
