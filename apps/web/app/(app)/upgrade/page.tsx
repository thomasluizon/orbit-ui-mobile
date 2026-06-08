'use client'

import { useState, useMemo, useCallback, useRef, useEffect, useId } from 'react'
import {
  Loader2, BadgeCheck, Sparkles, CreditCard,
  Flame, MessageSquare, Palette, ShieldCheck, BarChart3,
  AlertTriangle, Download, CheckCircle2, Clock, Check, X as XIcon,
  Megaphone, Tag, Info,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import {
  TRIAL_EXPIRED_FEATURE_KEYS,
  UPGRADE_FEATURE_CATEGORIES,
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
  type UpgradeIconKey,
} from '@orbit/shared/utils/upgrade'
import { plural } from '@/lib/plural'
import { useProfile, useHasProAccess, useTrialExpired, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'
import { useSubscriptionPlans, formatPrice, monthlyEquivalent } from '@/hooks/use-subscription-plans'
import { useBilling } from '@/hooks/use-billing'
import {
  formatLocaleDate,
  getClientTimeZone,
  getErrorMessage,
  playManageSubscriptionUrl,
} from '@orbit/shared/utils'
import { createCheckoutSession, openCustomerPortal } from '@/app/actions/subscription'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

const upgradeIconMap = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
} satisfies Record<UpgradeIconKey, React.ComponentType<{ className?: string }>>

function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function invoiceStatusClassName(status: string): string {
  if (status === 'paid') return 'bg-[var(--status-done)]/15 text-[var(--status-done)] border border-[var(--status-done)]/20'
  if (status === 'open') return 'bg-[var(--status-overdue)]/15 text-[var(--status-overdue)] border border-[var(--status-overdue)]/20'
  return 'bg-[var(--bg-elev)] text-[var(--fg-3)] border border-[var(--hairline)]'
}

function FeatureBooleanCell({ enabled, className }: Readonly<{ enabled: boolean | undefined; className: string }>) {
  if (enabled) return <Check className={`size-4 ${className}`} />
  return <XIcon className="size-4 text-[var(--fg-3)]/40" />
}

function UsageStats({ usagePercent, usageUrgent, profile, t }: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5 space-y-3">
      <h3 className="form-label">{t('upgrade.billing.usage.title')}</h3>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[var(--fg-1)]">{t('upgrade.billing.usage.aiMessages')}</span>
          <span className={`text-sm font-semibold ${usageUrgent ? 'text-[var(--status-overdue)]' : 'text-[var(--fg-1)]'}`}>
            {t('upgrade.billing.usage.aiMessagesOf', {
              used: profile?.aiMessagesUsed ?? 0,
              limit: profile?.aiMessagesLimit ?? 0,
            })}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[var(--bg-elev)]">
          <div
            className={`h-1.5 rounded-full transition-[width,background-color] duration-500 ${usageUrgent ? 'bg-[var(--status-overdue)]' : 'bg-[var(--primary)]'}`}
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
  const tooltipId = useId()

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
        className="shrink-0 p-0.5 rounded-full text-[var(--fg-3)]/60 hover:text-[var(--fg-2)] transition-colors"
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label={text}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={tooltipId}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <div id={tooltipId} role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-3 py-2.5 max-w-[260px] bg-[var(--bg-elev)] border border-[var(--hairline)] rounded-xl shadow-lg">
          <p className="text-xs text-[var(--fg-2)] leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

function formatBillingDate(isoDate: string, locale: string): string {
  return formatLocaleDate(isoDate, locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

function FeatureComparisonTable({ t }: Readonly<{ t: ReturnType<typeof useTranslations> }>) {
  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-3)]">{t('upgrade.feature')}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-3)] text-center w-16">{t('upgrade.free')}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--primary)] text-center w-16">{t('common.proBadge')}</span>
      </div>

      {UPGRADE_FEATURE_CATEGORIES.map((group) => (
        <div key={group.category} className="space-y-1.5">
          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]/70">
              {t(`upgrade.categories.${group.category}`)}
            </span>
          </div>

          {group.features.map((feat) => {
            const Icon = upgradeIconMap[feat.iconKey]

            return (
              <div
                key={feat.key}
                className="grid grid-cols-[1fr_auto_auto] gap-3 bg-[var(--bg-elev)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] py-3 px-4 items-center"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="size-4 text-[var(--fg-3)] shrink-0" />
                  <span className="text-sm text-[var(--fg-1)] truncate">{t(`upgrade.features.${feat.key}.label`)}</span>
                  <FeatureTooltip text={t(`upgrade.features.${feat.key}.tooltip`)} />
                </div>

                <div className="w-16 flex justify-center">
                  {feat.type === 'boolean'
                    ? <FeatureBooleanCell enabled={feat.freeEnabled} className="text-[var(--fg-3)]" />
                    : <span className="text-xs text-[var(--fg-3)] text-center">{t(`upgrade.features.${feat.key}.free`)}</span>}
                </div>

                <div className="w-16 flex justify-center">
                  {feat.type === 'boolean'
                    ? <FeatureBooleanCell enabled={feat.proEnabled} className="text-[var(--primary)]" />
                    : <span className="text-xs text-[var(--primary)] font-semibold text-center">{t(`upgrade.features.${feat.key}.pro`)}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface PlanCardsProps {
  plans: NonNullable<ReturnType<typeof useSubscriptionPlans>['plans']>
  hasProAccess: boolean
  checkoutLoading: string | null
  discountedAmount: (amount: number) => number
  onCheckout: (interval: 'monthly' | 'yearly') => void
  t: ReturnType<typeof useTranslations>
}

function PlanCards({ plans, hasProAccess, checkoutLoading, discountedAmount, onCheckout, t }: Readonly<PlanCardsProps>) {
  return (
    <div className="space-y-3 mb-6">
      <div className="rounded-[12px] border border-dashed border-[var(--hairline-strong)] bg-[var(--bg-sunk)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--fg-3)] uppercase tracking-wider">
            {t('upgrade.plans.free.name')}
          </h3>
          <span className="text-lg font-bold text-[var(--fg-3)]">
            {formatPrice(0, plans.currency)}
          </span>
        </div>
        <ul className="space-y-2 mb-4">
          <li className="flex items-center gap-2.5">
            <Flame className="size-3.5 text-[var(--fg-3)]/60 shrink-0" />
            <span className="text-xs text-[var(--fg-3)]">{t('upgrade.plans.free.features.habits')}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <MessageSquare className="size-3.5 text-[var(--fg-3)]/60 shrink-0" />
            <span className="text-xs text-[var(--fg-3)]">{t('upgrade.plans.free.features.ai')}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Palette className="size-3.5 text-[var(--fg-3)]/60 shrink-0" />
            <span className="text-xs text-[var(--fg-3)]">{t('upgrade.plans.free.features.theme')}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Megaphone className="size-3.5 text-[var(--status-overdue)]/80 shrink-0" />
            <span className="text-xs text-[var(--status-overdue)]/80 font-medium">{t('upgrade.plans.free.features.ads')}</span>
          </li>
        </ul>
        {!hasProAccess && (
          <button
            disabled
            className="w-full py-2.5 rounded-[var(--radius-lg)] bg-[var(--bg-elev)] text-[var(--fg-3)] text-xs font-semibold border border-[var(--hairline)] cursor-default opacity-60"
          >
            {t('upgrade.plans.free.cta')}
          </button>
        )}
      </div>

      <div className="rounded-[12px] border border-[var(--hairline)] bg-[var(--bg-elev)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-[var(--fg-1)]">
            {t('upgrade.plans.monthly.name')}
          </h3>
        </div>
        <div className="mb-4">
          {plans.couponPercentOff ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[var(--fg-1)]">
                {formatPrice(discountedAmount(plans.monthly.unitAmount), plans.currency)}
                <span className="text-sm font-semibold text-[var(--fg-2)]">{t('upgrade.plans.monthly.period')}</span>
              </span>
              <span className="text-sm text-[var(--fg-3)] line-through">
                {formatPrice(plans.monthly.unitAmount, plans.currency)}
              </span>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--status-done)]/15 text-[var(--status-done)] border border-[var(--status-done)]/20">
                {t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline">
              <span className="text-2xl font-extrabold text-[var(--fg-1)]">
                {formatPrice(plans.monthly.unitAmount, plans.currency)}
                <span className="text-sm font-semibold text-[var(--fg-2)]">{t('upgrade.plans.monthly.period')}</span>
              </span>
            </div>
          )}
        </div>
        <ul className="space-y-2 mb-4">
          {UPGRADE_PRO_FEATURES.map((feat) => {
            const Icon = upgradeIconMap[feat.iconKey]

            return (
              <li key={feat.key} className="flex items-center gap-2.5">
                <Icon className="size-3.5 text-[var(--primary)]/70 shrink-0" />
                <span className="text-xs text-[var(--fg-2)]">{t(`upgrade.plans.proFeatures.${feat.key}`)}</span>
              </li>
            )
          })}
        </ul>
        <button
          className="w-full py-3 rounded-[var(--radius-lg)] bg-[var(--bg-elev)] text-[var(--fg-1)] text-sm font-semibold border border-[var(--hairline)] hover:bg-[var(--bg-elev)] transition-[background-color,border-color,color,transform,opacity] duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          disabled={!!checkoutLoading}
          onClick={() => onCheckout('monthly')}
        >
          {checkoutLoading === 'monthly' && <Loader2 className="size-4 animate-spin" />}
          {t('upgrade.plans.monthly.cta')}
        </button>
      </div>

      <div className="relative rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--bg-elev)] p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[var(--bg-elev)] text-[var(--primary)] border border-[var(--hairline-strong)]">
            {t('upgrade.plans.yearly.recommended')}
          </span>
          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-[var(--status-done)]/15 text-[var(--status-done)] border border-[var(--status-done)]/20">
            {t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
          </span>
        </div>
        <h3 className="text-sm font-bold text-[var(--fg-1)] mb-1">
          {t('upgrade.plans.yearly.name')}
        </h3>
        <div className="mb-1">
          {plans.couponPercentOff ? (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-extrabold text-[var(--fg-1)]">
                {formatPrice(discountedAmount(plans.yearly.unitAmount), plans.currency)}
                <span className="text-sm font-semibold text-[var(--fg-2)]">{t('upgrade.plans.yearly.period')}</span>
              </span>
              <span className="text-sm text-[var(--fg-3)] line-through">
                {formatPrice(plans.yearly.unitAmount, plans.currency)}
              </span>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[var(--status-done)]/15 text-[var(--status-done)] border border-[var(--status-done)]/20">
                {t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}
              </span>
            </div>
          ) : (
            <div className="flex items-baseline">
              <span className="text-2xl font-extrabold text-[var(--fg-1)]">
                {formatPrice(plans.yearly.unitAmount, plans.currency)}
                <span className="text-sm font-semibold text-[var(--fg-2)]">{t('upgrade.plans.yearly.period')}</span>
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--fg-3)] mb-4">
          {plans.couponPercentOff
            ? t('upgrade.plans.equivalent', { price: formatPrice(monthlyEquivalent(discountedAmount(plans.yearly.unitAmount)), plans.currency) })
            : t('upgrade.plans.equivalent', { price: formatPrice(monthlyEquivalent(plans.yearly.unitAmount), plans.currency) })}
        </p>
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--primary)]/[0.04] border border-[var(--primary)]/10 px-3 py-2">
            <BadgeCheck className="size-4 text-[var(--primary)]/50 shrink-0" />
            <span className="text-xs text-[var(--fg-2)]">{t('upgrade.plans.yearly.includesMonthly')}</span>
          </div>
          <ul className="space-y-2">
            {UPGRADE_YEARLY_EXTRA_FEATURES.map((feat) => {
              const Icon = upgradeIconMap[feat.iconKey]

              return (
                <li key={feat.key} className="flex items-center gap-2.5">
                  <Icon className="size-3.5 text-[var(--primary)]/70 shrink-0" />
                  <span className="text-xs text-[var(--fg-2)]">{t(`upgrade.plans.proFeatures.${feat.key}`)}</span>
                </li>
              )
            })}
          </ul>
        </div>
        {plans.couponPercentOff && (
          <p className="text-[10px] text-[var(--status-done)]/70 mb-3 flex items-center gap-1.5">
            <Tag className="size-3 shrink-0" />
            {t('upgrade.plans.coupon.appliedNote')}
          </p>
        )}
        <button
          className="w-full py-3.5 rounded-[12px] bg-[var(--primary)] text-white text-sm font-bold hover:bg-[var(--primary-pressed)] transition-[background-color,border-color,color,transform,opacity] duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          disabled={!!checkoutLoading}
          onClick={() => onCheckout('yearly')}
        >
          {checkoutLoading === 'yearly' && <Loader2 className="size-4 animate-spin" />}
          {t('upgrade.plans.yearly.cta')}
        </button>
      </div>
    </div>
  )
}

interface BillingDashboardProps {
  billing: ReturnType<typeof useBilling>['billing']
  isBillingLoading: boolean
  isBillingError: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number; isLifetimePro?: boolean } | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  portalError: string
  onOpenPortal: () => void
  onRetryBilling: () => void
  t: ReturnType<typeof useTranslations>
}

function BillingDashboard({
  billing, isBillingLoading, isBillingError, profile, locale,
  usagePercent, usageUrgent, portalError, onOpenPortal, onRetryBilling, t,
}: Readonly<BillingDashboardProps>) {
  return (
    <div className="space-y-3">
      {isBillingLoading && (
        <>
          <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-full bg-[var(--bg-elev)] skeleton-shimmer shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-28 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
                <div className="h-3 w-44 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
              </div>
            </div>
          </div>
          <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5 space-y-3">
            <div className="h-3 w-20 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
                <div className="h-3.5 w-16 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
              </div>
              <div className="h-1.5 w-full bg-[var(--bg-elev)] rounded-full skeleton-shimmer" />
            </div>
          </div>
        </>
      )}

      {isBillingError && !billing && !isBillingLoading && (
        <div className="bg-[var(--bg-elev)] rounded-[12px] border border-[var(--hairline)] p-8 text-center space-y-3">
          <AlertTriangle className="size-8 text-[var(--fg-3)] mx-auto" />
          <p className="text-sm text-[var(--fg-2)]">{t('upgrade.billing.error')}</p>
          <button className="text-[var(--primary)] text-sm font-semibold hover:underline" onClick={onRetryBilling}>
            {t('upgrade.billing.retry')}
          </button>
        </div>
      )}

      {billing && (
        <>
          <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5">
            <div className="flex items-center gap-4">
              <div className="bg-[var(--bg-elev)] rounded-full size-12 flex items-center justify-center shrink-0">
                <BadgeCheck className="size-6 text-[var(--primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--fg-1)]">
                    {billing.interval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
                  </h2>
                  {billing.cancelAtPeriodEnd && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--status-overdue)]/15 text-[var(--status-overdue)] border border-[var(--status-overdue)]/20">
                      {t('upgrade.billing.plan.canceledBadge')}
                    </span>
                  )}
                  {!billing.cancelAtPeriodEnd && billing.status === 'past_due' && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--status-bad)]/15 text-[var(--status-bad)] border border-[var(--status-bad)]/20">
                      {t('upgrade.billing.plan.pastDue')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--fg-2)] mt-0.5">
                  {billing.cancelAtPeriodEnd
                    ? t('upgrade.billing.plan.canceledHint', { date: formatBillingDate(billing.currentPeriodEnd, locale) })
                    : t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(billing.currentPeriodEnd, locale) })}
                  {billing.amountPerPeriod > 0 && (
                    <span className="text-[var(--fg-3)]">
                      {' '}&middot;{' '}{formatPrice(billing.amountPerPeriod, billing.currency)}
                      {billing.interval === 'yearly' ? t('upgrade.plans.yearly.period') : t('upgrade.plans.monthly.period')}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {billing.paymentMethod && (
            <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <CreditCard className="size-8 text-[var(--fg-3)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--fg-1)]">
                      {t('upgrade.billing.payment.card', {
                        brand: formatCardBrand(billing.paymentMethod.brand),
                        last4: billing.paymentMethod.last4,
                      })}
                    </p>
                    <p className="text-xs text-[var(--fg-3)] mt-0.5">
                      {t('upgrade.billing.payment.expires', {
                        month: String(billing.paymentMethod.expMonth).padStart(2, '0'),
                        year: billing.paymentMethod.expYear,
                      })}
                    </p>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-semibold text-[var(--fg-2)] bg-[var(--bg-elev)] border border-[var(--hairline)] hover:bg-[var(--bg-elev)] transition-colors shrink-0"
                  onClick={onOpenPortal}
                >
                  {t('upgrade.billing.payment.change')}
                </button>
              </div>
            </div>
          )}

          <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />

          {billing.recentInvoices.length > 0 && (
            <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] overflow-hidden">
              <div className="p-5 pb-3">
                <h3 className="form-label">{t('upgrade.billing.invoices.title')}</h3>
              </div>
              <div className="divide-y divide-border-muted">
                {billing.recentInvoices.map((invoice) => (
                  <div key={invoice.id} className="px-5 py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-[var(--fg-1)] font-medium">
                          {formatBillingDate(invoice.date, locale)}
                        </span>
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full bg-[var(--bg-elev)] text-[var(--fg-3)] border border-[var(--hairline)]">
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
                      <span className="text-sm font-semibold text-[var(--fg-1)]">
                        {formatPrice(invoice.amountPaid, invoice.currency)}
                      </span>
                      {(invoice.invoicePdf ?? invoice.hostedInvoiceUrl) && (
                        <a
                          href={invoice.invoicePdf ?? invoice.hostedInvoiceUrl ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
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

          <div className="space-y-2 pt-1">
            <button
              className="w-full py-3 rounded-[12px] bg-[var(--bg-elev)] text-[var(--fg-1)] text-sm font-semibold border border-[var(--hairline)] hover:bg-[var(--bg-elev)] transition-[background-color,border-color,color,transform,opacity] duration-200 active:scale-[0.98]"
              onClick={onOpenPortal}
            >
              {t('upgrade.billing.actions.manage')}
            </button>
            <p className="text-xs text-[var(--fg-3)] text-center">{t('upgrade.billing.actions.manageHint')}</p>
            {portalError && <p className="text-xs text-[var(--status-bad)] text-center">{portalError}</p>}
          </div>
        </>
      )}

      {!isBillingLoading && !isBillingError && !billing && (
        <>
          <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5">
            <div className="flex items-center gap-4">
              <div className="bg-[var(--bg-elev)] rounded-full size-12 flex items-center justify-center shrink-0">
                <Sparkles className="size-6 text-[var(--primary)]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-[var(--fg-1)]">
                  {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetime') : t('upgrade.alreadyPro')}
                </h2>
                <p className="text-sm text-[var(--fg-2)] mt-0.5">
                  {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetimeHint') : t('upgrade.manageHint')}
                </p>
              </div>
            </div>
          </div>

          <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />
        </>
      )}
    </div>
  )
}

interface PlayBillingDashboardProps {
  profile: {
    subscriptionInterval?: string | null
    planExpiresAt?: string | null
    aiMessagesUsed: number
    aiMessagesLimit: number
  } | null
  locale: string
  usagePercent: number
  usageUrgent: boolean
  t: ReturnType<typeof useTranslations>
}

function PlayBillingDashboard({ profile, locale, usagePercent, usageUrgent, t }: Readonly<PlayBillingDashboardProps>) {
  return (
    <div className="space-y-3">
      <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5">
        <div className="flex items-center gap-4">
          <div className="bg-[var(--bg-elev)] rounded-full size-12 flex items-center justify-center shrink-0">
            <BadgeCheck className="size-6 text-[var(--primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--fg-1)]">
              {profile?.subscriptionInterval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
            </h2>
            {profile?.planExpiresAt && (
              <p className="text-sm text-[var(--fg-2)] mt-0.5">
                {t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(profile.planExpiresAt, locale) })}
              </p>
            )}
          </div>
        </div>
      </div>

      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />

      <div className="space-y-2 pt-1">
        <a
          href={playManageSubscriptionUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 rounded-[12px] bg-[var(--bg-elev)] text-[var(--fg-1)] text-sm font-semibold border border-[var(--hairline)] hover:bg-[var(--bg-elev)] transition-[background-color,border-color,color,transform,opacity] duration-200 active:scale-[0.98] flex items-center justify-center"
        >
          {t('upgrade.billing.actions.managePlay')}
        </a>
        <p className="text-xs text-[var(--fg-3)] text-center">{t('upgrade.billing.actions.managePlayHint')}</p>
      </div>
    </div>
  )
}

interface PricingSectionProps {
  profile: { isTrialActive?: boolean } | null
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoadingPlans: boolean
  isPlansError: boolean
  trialExpired: boolean
  trialDaysLeft: number | null
  trialUrgent: boolean
  hasProAccess: boolean
  checkoutLoading: string | null
  checkoutError: string
  discountedAmount: (amount: number) => number
  onCheckout: (interval: 'monthly' | 'yearly') => void
  onRetryPlans: () => void
  t: ReturnType<typeof useTranslations>
}

function PricingSection({
  profile, plans, isLoadingPlans, isPlansError, trialExpired, trialDaysLeft, trialUrgent,
  hasProAccess, checkoutLoading, checkoutError, discountedAmount, onCheckout, onRetryPlans, t,
}: Readonly<PricingSectionProps>) {
  return (
    <>
      {profile?.isTrialActive && (
        <div
          className={`rounded-[12px] p-4 mb-4 flex items-center gap-3 border ${
            trialUrgent
              ? 'bg-[var(--status-overdue)]/10 border-[var(--status-overdue)]/20'
              : 'bg-[var(--bg-sunk)] border-[var(--hairline-strong)]'
          }`}
        >
          <Clock className={`size-5 shrink-0 ${trialUrgent ? 'text-[var(--status-overdue)]' : 'text-[var(--primary)]'}`} />
          <p className={`text-sm font-medium ${trialUrgent ? 'text-[var(--status-overdue)]' : 'text-[var(--fg-1)]'}`}>
            {trialDaysLeft === 0
              ? t('trial.banner.lastDay')
              : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
          </p>
        </div>
      )}

      {trialExpired && (
        <div className="bg-[var(--bg-elev)] rounded-[12px] shadow-[var(--shadow-sm)] p-5 mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--primary)]" />
            <span className="text-sm font-bold text-[var(--fg-1)]">{t('trial.expired.title')}</span>
          </div>
          <p className="form-label">
            {t('trial.expired.dontLose')}
          </p>
          <ul className="space-y-2">
            {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 text-[var(--primary)] shrink-0" />
                <span className="text-sm text-[var(--fg-2)]">{t(feature)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoadingPlans && (
        <div className="space-y-3 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[12px] p-5 border border-[var(--hairline)]">
              <div className="flex items-center justify-between mb-4">
                <div className="h-4 w-20 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
                <div className="h-6 w-16 bg-[var(--bg-elev)] rounded-full skeleton-shimmer" />
              </div>
              <div className="space-y-2.5 mb-4">
                <div className="h-3 w-3/4 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
                <div className="h-3 w-1/2 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
                <div className="h-3 w-2/3 bg-[var(--bg-elev)] rounded skeleton-shimmer" />
              </div>
              <div className="h-10 w-full bg-[var(--bg-elev)] rounded-[var(--radius-lg)] skeleton-shimmer" />
            </div>
          ))}
        </div>
      )}

      {isPlansError && !plans && !isLoadingPlans && (
        <div className="bg-[var(--bg-elev)] rounded-[12px] border border-[var(--hairline)] p-8 text-center space-y-3 mb-6">
          <AlertTriangle className="size-8 text-[var(--fg-3)] mx-auto" />
          <p className="text-sm text-[var(--fg-2)]">{t('upgrade.plans.error')}</p>
          <button className="text-[var(--primary)] text-sm font-semibold hover:underline" onClick={onRetryPlans}>
            {t('upgrade.plans.retry')}
          </button>
        </div>
      )}

      {plans && (
        <PlanCards
          plans={plans}
          hasProAccess={hasProAccess}
          checkoutLoading={checkoutLoading}
          discountedAmount={discountedAmount}
          onCheckout={onCheckout}
          t={t}
        />
      )}

      {checkoutError && (
        <p className="text-xs text-[var(--status-bad)] text-center">{checkoutError}</p>
      )}

      <FeatureComparisonTable t={t} />
    </>
  )
}

export default function UpgradePage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()

  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const { plans, isLoading: isLoadingPlans, isError: isPlansError, refetch: refetchPlans, discountedAmount } = useSubscriptionPlans()

  const isPlaySource = profile?.subscriptionSource === 'play'
  const isBillingEnabled = hasProAccess && !profile?.isTrialActive && !isPlaySource && !profile?.isLifetimePro
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
      const timeZone = getClientTimeZone()
      const data = await createCheckoutSession(interval, timeZone)
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
      const data = await openCustomerPortal()
      if (data?.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getErrorMessage(err, t('auth.genericError')))
    }
  }, [t])

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('upgrade.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">

      {hasProAccess && !profile?.isTrialActive ? (
        isPlaySource ? (
          <PlayBillingDashboard
            profile={profile ?? null}
            locale={locale}
            usagePercent={usagePercent}
            usageUrgent={usageUrgent}
            t={t}
          />
        ) : (
          <BillingDashboard
            billing={billing}
            isBillingLoading={isBillingLoading}
            isBillingError={isBillingError}
            profile={profile ?? null}
            locale={locale}
            usagePercent={usagePercent}
            usageUrgent={usageUrgent}
            portalError={portalError}
            onOpenPortal={handleOpenPortal}
            onRetryBilling={() => refetchBilling()}
            t={t}
          />
        )
      ) : (
        <PricingSection
          profile={profile ?? null}
          plans={plans}
          isLoadingPlans={isLoadingPlans}
          isPlansError={isPlansError}
          trialExpired={trialExpired}
          trialDaysLeft={trialDaysLeft}
          trialUrgent={trialUrgent}
          hasProAccess={hasProAccess}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          discountedAmount={discountedAmount}
          onCheckout={handleCheckout}
          onRetryPlans={() => refetchPlans()}
          t={t}
        />
      )}
      </div>
    </div>
  )
}
