'use client'

import { useState, useMemo, useCallback, useRef, useEffect, useId } from 'react'
import {
  Loader2, Sparkles, CreditCard, Settings,
  Flame, MessageSquare, Palette, ShieldCheck, BarChart3,
  AlertTriangle, Download, Clock, Check, X as XIcon,
  Tag, Info, Receipt,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { Badge } from '@/components/ui/badge'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { PlanCard } from '@/components/upgrade/plan-card'
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

type SubscriptionInterval = 'monthly' | 'yearly'

const upgradeIconMap = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
} satisfies Record<UpgradeIconKey, React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>>

const cardSurface: React.CSSProperties = {
  background: 'var(--bg-card)',
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
}

const cardLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--fg-3)',
}

const metaTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-3)',
}

const whitePillLinkClassName =
  'inline-flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full bg-[var(--fg-1)] px-[26px] py-[14px] text-[16px] font-medium text-[var(--bg)] transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:opacity-90 active:translate-y-0 active:scale-[0.98]'

function formatCardBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1)
}

function invoiceStatusColor(status: string): string {
  if (status === 'paid') return 'var(--status-done)'
  if (status === 'open') return 'var(--status-overdue)'
  return 'var(--fg-3)'
}

function UsageStats({ usagePercent, usageUrgent, profile, t }: Readonly<{
  usagePercent: number
  usageUrgent: boolean
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
      <div style={cardLabelStyle}>{t('upgrade.billing.usage.title')}</div>
      <div className="flex items-baseline justify-between" style={{ marginTop: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
          {t('upgrade.billing.usage.aiMessages')}
        </span>
        <span
          style={{
            ...metaTextStyle,
            color: usageUrgent ? 'var(--status-overdue)' : 'var(--fg-2)',
          }}
        >
          {t('upgrade.billing.usage.aiMessagesOf', {
            used: profile?.aiMessagesUsed ?? 0,
            limit: profile?.aiMessagesLimit ?? 0,
          })}
        </span>
      </div>
      <ProgressBar
        progress={usagePercent / 100}
        label={t('upgrade.billing.usage.aiMessages')}
        color={usageUrgent ? 'var(--status-overdue)' : undefined}
      />
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
        className="icon-btn -m-2 shrink-0 hover:text-[var(--fg-2)]"
        style={{ width: 36, height: 36, color: 'var(--fg-4)' }}
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label={text}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={tooltipId}
      >
        <Info size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 max-w-[260px] -translate-x-1/2 rounded-[12px]"
          style={{
            padding: '10px 12px',
            background: 'var(--bg-sheet)',
            boxShadow: 'inset 0 0 0 1px var(--hairline), var(--shadow-2)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              lineHeight: 1.55,
              color: 'var(--fg-2)',
            }}
          >
            {text}
          </p>
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

const comparisonEyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
}

function FeatureBooleanCell({ enabled, pro }: Readonly<{ enabled: boolean | undefined; pro: boolean }>) {
  if (enabled) {
    return (
      <Check
        size={16}
        strokeWidth={2.4}
        className={pro ? 'text-[var(--primary-soft)]' : 'text-[var(--fg-3)]'}
        aria-hidden="true"
      />
    )
  }
  return <XIcon size={16} strokeWidth={1.8} className="text-[var(--fg-4)]" aria-hidden="true" />
}

function FeatureComparisonTable({ t }: Readonly<{ t: ReturnType<typeof useTranslations> }>) {
  return (
    <div style={{ marginTop: 28 }}>
      <div className="grid grid-cols-[1fr_auto_auto] items-center" style={{ gap: 12, padding: '0 4px 6px' }}>
        <span style={comparisonEyebrowStyle}>{t('upgrade.feature')}</span>
        <span className="w-14 text-center" style={comparisonEyebrowStyle}>{t('upgrade.free')}</span>
        <span className="w-14 text-center" style={{ ...comparisonEyebrowStyle, color: 'var(--primary-soft)' }}>
          {t('common.proBadge')}
        </span>
      </div>

      {UPGRADE_FEATURE_CATEGORIES.map((group) => (
        <div key={group.category}>
          <div style={{ padding: '18px 4px 4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                color: 'var(--fg-1)',
              }}
            >
              {t(`upgrade.categories.${group.category}`)}
            </span>
          </div>

          {group.features.map((feat) => {
            const Icon = upgradeIconMap[feat.iconKey]

            return (
              <div
                key={feat.key}
                className="grid grid-cols-[1fr_auto_auto] items-center"
                style={{ gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--hairline)' }}
              >
                <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
                  <Icon size={16} strokeWidth={1.8} className="shrink-0 text-[var(--fg-3)]" />
                  <span
                    className="truncate"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
                  >
                    {t(`upgrade.features.${feat.key}.label`)}
                  </span>
                  <FeatureTooltip text={t(`upgrade.features.${feat.key}.tooltip`)} />
                </div>

                <div className="flex w-14 justify-center">
                  {feat.type === 'boolean'
                    ? <FeatureBooleanCell enabled={feat.freeEnabled} pro={false} />
                    : (
                      <span className="text-center" style={{ ...metaTextStyle, fontSize: 11.5 }}>
                        {t(`upgrade.features.${feat.key}.free`)}
                      </span>
                    )}
                </div>

                <div className="flex w-14 justify-center">
                  {feat.type === 'boolean'
                    ? <FeatureBooleanCell enabled={feat.proEnabled} pro />
                    : (
                      <span className="text-center" style={{ ...metaTextStyle, fontSize: 11.5, color: 'var(--fg-1)' }}>
                        {t(`upgrade.features.${feat.key}.pro`)}
                      </span>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface PlanSelectionProps {
  plans: NonNullable<ReturnType<typeof useSubscriptionPlans>['plans']>
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  discountedAmount: (amount: number) => number
  t: ReturnType<typeof useTranslations>
}

function PlanSelection({ plans, selectedInterval, onSelectInterval, discountedAmount, t }: Readonly<PlanSelectionProps>) {
  const yearlyAmount = discountedAmount(plans.yearly.unitAmount)
  const monthlyAmount = discountedAmount(plans.monthly.unitAmount)
  const discountSuffix = plans.couponPercentOff
    ? ` · ${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
    : ''

  return (
    <div role="radiogroup" aria-label={t('upgrade.plan')} className="flex flex-col stagger-enter" style={{ gap: 14 }}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={t('upgrade.plans.equivalent', {
          price: formatPrice(monthlyEquivalent(yearlyAmount), plans.currency),
        })}
        sub={`${formatPrice(yearlyAmount, plans.currency)}${t('upgrade.plans.yearly.period')}${discountSuffix}`}
        features={[
          t('upgrade.plans.yearly.includesMonthly'),
          ...UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => t(`upgrade.plans.proFeatures.${feature.key}`)),
        ]}
        selected={selectedInterval === 'yearly'}
        onSelect={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${formatPrice(monthlyAmount, plans.currency)}${t('upgrade.plans.monthly.period')}`}
        sub={plans.couponPercentOff
          ? `${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
          : undefined}
        features={UPGRADE_PRO_FEATURES.map((feature) => t(`upgrade.plans.proFeatures.${feature.key}`))}
        selected={selectedInterval === 'monthly'}
        onSelect={() => onSelectInterval('monthly')}
      />
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
    <div className="space-y-3 stagger-enter">
      {isBillingLoading && (
        <>
          <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
            <div className="skeleton-pulse h-3.5 w-20 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="skeleton-pulse mt-2.5 h-4 w-36 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="skeleton-pulse mt-2 h-3 w-44 rounded" style={{ background: 'var(--bg-elev-2)' }} />
          </div>
          <div className="rounded-[18px]" style={{ padding: '16px 18px', ...cardSurface }}>
            <div className="skeleton-pulse h-3.5 w-20 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            <div className="mt-3 flex items-center justify-between">
              <div className="skeleton-pulse h-3.5 w-24 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="skeleton-pulse h-3.5 w-16 rounded" style={{ background: 'var(--bg-elev-2)' }} />
            </div>
            <div className="skeleton-pulse mt-3 h-2 w-full rounded-full" style={{ background: 'var(--bg-elev-2)' }} />
          </div>
        </>
      )}

      {isBillingError && !billing && !isBillingLoading && (
        <div className="rounded-[18px] text-center" style={{ padding: '28px 18px', ...cardSurface }}>
          <AlertTriangle size={26} strokeWidth={1.8} className="mx-auto text-[var(--fg-3)]" />
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('upgrade.billing.error')}
          </p>
          <button
            type="button"
            className="chip"
            style={{ marginTop: 10 }}
            onClick={onRetryBilling}
          >
            {t('upgrade.billing.retry')}
          </button>
        </div>
      )}

      {billing && (
        <>
          <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--hairline)' }}>
              <div style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</div>
              <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 3 }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--fg-1)' }}>
                  {billing.interval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
                </span>
                {billing.cancelAtPeriodEnd && (
                  <Badge tone="amber">{t('upgrade.billing.plan.canceledBadge')}</Badge>
                )}
                {!billing.cancelAtPeriodEnd && billing.status === 'past_due' && (
                  <span
                    className="inline-flex items-center rounded-full uppercase"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      padding: '3px 9px',
                      background: 'color-mix(in srgb, var(--status-bad) 18%, transparent)',
                      color: 'var(--status-bad)',
                    }}
                  >
                    {t('upgrade.billing.plan.pastDue')}
                  </span>
                )}
              </div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <span style={metaTextStyle}>
                {billing.cancelAtPeriodEnd
                  ? t('upgrade.billing.plan.canceledHint', { date: formatBillingDate(billing.currentPeriodEnd, locale) })
                  : t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(billing.currentPeriodEnd, locale) })}
                {billing.amountPerPeriod > 0 && (
                  <>
                    {' · '}
                    {formatPrice(billing.amountPerPeriod, billing.currency)}
                    {billing.interval === 'yearly' ? t('upgrade.plans.yearly.period') : t('upgrade.plans.monthly.period')}
                  </>
                )}
              </span>
            </div>
          </div>

          {billing.paymentMethod && (
            <div className="flex items-center rounded-[18px]" style={{ padding: '16px 18px', gap: 14, ...cardSurface }}>
              <CreditCard size={24} strokeWidth={1.8} className="shrink-0 text-[var(--fg-3)]" />
              <div className="min-w-0 flex-1">
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}>
                  {t('upgrade.billing.payment.card', {
                    brand: formatCardBrand(billing.paymentMethod.brand),
                    last4: billing.paymentMethod.last4,
                  })}
                </p>
                <p style={{ margin: '2px 0 0', ...metaTextStyle, fontSize: 12.5 }}>
                  {t('upgrade.billing.payment.expires', {
                    month: String(billing.paymentMethod.expMonth).padStart(2, '0'),
                    year: billing.paymentMethod.expYear,
                  })}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center rounded-full border-0 bg-transparent transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.97]"
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                }}
                onClick={onOpenPortal}
              >
                {t('upgrade.billing.payment.change')}
              </button>
            </div>
          )}

          <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />

          {billing.recentInvoices.length > 0 && (
            <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
              <div style={{ padding: '14px 18px 2px', ...cardLabelStyle }}>
                {t('upgrade.billing.invoices.title')}
              </div>
              {billing.recentInvoices.map((invoice, index) => (
                <div
                  key={invoice.id}
                  className="flex items-center"
                  style={{
                    padding: '14px 18px',
                    gap: 14,
                    borderTop: index > 0 ? '1px solid var(--hairline)' : undefined,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex shrink-0 justify-center"
                    style={{ width: 26 }}
                  >
                    <Receipt size={22} strokeWidth={1.8} color="var(--fg-1)" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--fg-1)' }}>
                      {formatPrice(invoice.amountPaid, invoice.currency)}
                    </div>
                    <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                        {formatBillingDate(invoice.date, locale)} · {invoiceReasonLabelFn(invoice.billingReason, t)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: invoiceStatusColor(invoice.status),
                    }}
                  >
                    {invoiceStatusLabelFn(invoice.status, t)}
                  </span>
                  {(invoice.invoicePdf ?? invoice.hostedInvoiceUrl) && (
                    <a
                      href={invoice.invoicePdf ?? invoice.hostedInvoiceUrl ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-btn shrink-0"
                      style={{ width: 40, height: 40, color: 'var(--fg-3)' }}
                      title={t('upgrade.billing.invoices.download')}
                    >
                      <Download size={20} strokeWidth={1.8} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col items-stretch" style={{ gap: 10, paddingTop: 6 }}>
            <PillButton
              variant="white"
              fullWidth
              onClick={onOpenPortal}
              leading={<Settings size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {t('upgrade.billing.actions.manage')}
            </PillButton>
            <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}>
              {t('upgrade.billing.actions.manageHint')}
            </p>
            {portalError && (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-bad)' }}>
                {portalError}
              </p>
            )}
          </div>
        </>
      )}

      {!isBillingLoading && !isBillingError && !billing && (
        <>
          <div className="flex flex-col items-center text-center" style={{ padding: '26px 20px 10px', gap: 10 }}>
            <VerifiedBadge size={84} />
            <h2
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                color: 'var(--fg-1)',
              }}
            >
              {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetime') : t('upgrade.alreadyPro')}
            </h2>
            <p style={{ margin: 0, maxWidth: 320, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-3)' }}>
              {profile?.isLifetimePro ? t('upgrade.billing.plan.lifetimeHint') : t('upgrade.manageHint')}
            </p>
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
    <div className="space-y-3 stagger-enter">
      <div className="overflow-hidden rounded-[18px]" style={cardSurface}>
        <div style={{ padding: '16px 18px' }}>
          <div style={cardLabelStyle}>{t('upgrade.billing.plan.title')}</div>
          <div style={{ marginTop: 3, fontFamily: 'var(--font-sans)', fontSize: 17, color: 'var(--fg-1)' }}>
            {profile?.subscriptionInterval === 'yearly' ? t('upgrade.billing.plan.yearly') : t('upgrade.billing.plan.monthly')}
          </div>
          {profile?.planExpiresAt && (
            <div style={{ marginTop: 6 }}>
              <span style={metaTextStyle}>
                {t('upgrade.billing.plan.renewsOn', { date: formatBillingDate(profile.planExpiresAt, locale) })}
              </span>
            </div>
          )}
        </div>
      </div>

      <UsageStats usagePercent={usagePercent} usageUrgent={usageUrgent} profile={profile} t={t} />

      <div className="flex flex-col items-stretch" style={{ gap: 10, paddingTop: 6 }}>
        <a
          href={playManageSubscriptionUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className={whitePillLinkClassName}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
          {t('upgrade.billing.actions.managePlay')}
        </a>
        <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}>
          {t('upgrade.billing.actions.managePlayHint')}
        </p>
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
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  checkoutLoading: string | null
  checkoutError: string
  discountedAmount: (amount: number) => number
  onCheckout: (interval: SubscriptionInterval) => void
  onRetryPlans: () => void
  t: ReturnType<typeof useTranslations>
}

function PricingSection({
  profile, plans, isLoadingPlans, isPlansError, trialExpired, trialDaysLeft, trialUrgent,
  selectedInterval, onSelectInterval, checkoutLoading, checkoutError, discountedAmount,
  onCheckout, onRetryPlans, t,
}: Readonly<PricingSectionProps>) {
  return (
    <>
      <h1
        style={{
          margin: '0 0 22px',
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {t('upgrade.heroTitle')}
      </h1>

      {profile?.isTrialActive && (
        <div
          className="flex items-center rounded-[14px]"
          style={{
            padding: '12px 16px',
            gap: 10,
            marginBottom: 16,
            background: trialUrgent
              ? 'color-mix(in srgb, var(--status-overdue) 10%, transparent)'
              : 'rgba(var(--primary-rgb), 0.08)',
            boxShadow: trialUrgent
              ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-overdue) 28%, transparent)'
              : 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.18)',
          }}
        >
          <Clock
            size={16}
            strokeWidth={1.8}
            className={`shrink-0 ${trialUrgent ? 'text-[var(--status-overdue)]' : 'text-[var(--primary-soft)]'}`}
          />
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: trialUrgent ? 'var(--status-overdue)' : 'var(--fg-1)',
            }}
          >
            {trialDaysLeft === 0
              ? t('trial.banner.lastDay')
              : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
          </p>
        </div>
      )}

      {trialExpired && (
        <div className="rounded-[18px]" style={{ padding: 18, marginBottom: 16, ...cardSurface }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <Sparkles size={18} strokeWidth={1.8} className="shrink-0 text-[var(--primary-soft)]" />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--fg-1)' }}>
              {t('trial.expired.title')}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
            {t('trial.expired.dontLose')}
          </p>
          <div className="flex flex-col" style={{ gap: 9, marginTop: 12 }}>
            {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
              <div key={feature} className="flex items-center" style={{ gap: 10 }}>
                <Check size={16} strokeWidth={2.4} className="shrink-0 text-[var(--primary-soft)]" aria-hidden="true" />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
                  {t(feature)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoadingPlans && (
        <div className="flex flex-col" style={{ gap: 14, marginBottom: 22 }}>
          {[1, 2].map((i) => (
            <div key={i} className="rounded-[18px]" style={{ padding: '18px 18px 20px', ...cardSurface }}>
              <div className="flex items-center justify-between">
                <div className="skeleton-pulse h-4 w-24 rounded" style={{ background: 'var(--bg-elev-2)' }} />
                <div className="skeleton-pulse size-6 rounded-full" style={{ background: 'var(--bg-elev-2)' }} />
              </div>
              <div className="skeleton-pulse mt-3 h-5 w-28 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="mt-4 space-y-2.5">
                <div className="skeleton-pulse h-3 w-3/4 rounded" style={{ background: 'var(--bg-elev-2)' }} />
                <div className="skeleton-pulse h-3 w-1/2 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isPlansError && !plans && !isLoadingPlans && (
        <div className="rounded-[18px] text-center" style={{ padding: '28px 18px', marginBottom: 22, ...cardSurface }}>
          <AlertTriangle size={26} strokeWidth={1.8} className="mx-auto text-[var(--fg-3)]" />
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('upgrade.plans.error')}
          </p>
          <button
            type="button"
            className="chip"
            style={{ marginTop: 10 }}
            onClick={onRetryPlans}
          >
            {t('upgrade.plans.retry')}
          </button>
        </div>
      )}

      {plans && (
        <>
          <PlanSelection
            plans={plans}
            selectedInterval={selectedInterval}
            onSelectInterval={onSelectInterval}
            discountedAmount={discountedAmount}
            t={t}
          />

          <div className="flex flex-col items-stretch" style={{ gap: 12, marginTop: 22 }}>
            {plans.couponPercentOff ? (
              <p
                className="flex items-center justify-center"
                style={{ gap: 6, margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--status-done)' }}
              >
                <Tag size={13} strokeWidth={1.8} aria-hidden="true" />
                {t('upgrade.plans.coupon.appliedNote')}
              </p>
            ) : null}
            <PillButton
              fullWidth
              disabled={!!checkoutLoading}
              onClick={() => onCheckout(selectedInterval)}
              leading={checkoutLoading
                ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                : <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {selectedInterval === 'yearly' ? t('upgrade.plans.yearly.cta') : t('upgrade.plans.monthly.cta')}
            </PillButton>
            {checkoutLoading ? (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                {t('common.loading')}
              </p>
            ) : null}
            {checkoutError && (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-bad)' }}>
                {checkoutError}
              </p>
            )}
            <p
              className="text-center"
              style={{ margin: '4px 4px 0', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--fg-4)' }}
            >
              {t('upgrade.plans.renewalNote')}
            </p>
          </div>
        </>
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

  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalError, setPortalError] = useState('')

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100))
  }, [profile])
  const usageUrgent = usagePercent > 80

  const isManageView = hasProAccess && !profile?.isTrialActive
  const showsProPanel = isManageView && !isPlaySource && !billing && !isBillingLoading && !isBillingError
  const showGradient = !isManageView || showsProPanel

  const handleCheckout = useCallback(async (interval: SubscriptionInterval) => {
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
    <div className="relative flex min-h-[100dvh] flex-col">
      {showGradient && <GradientTop height={260} />}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('upgrade.title')}
        />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">

        {isManageView ? (
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
            selectedInterval={selectedInterval}
            onSelectInterval={setSelectedInterval}
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
    </div>
  )
}
