import type { BillingProvider, SubscriptionStatus } from '../types/profile'

export type SubscriptionPortalState = 'idle' | 'opening' | 'failed'

export type SubscriptionScreenContent = 'pitch' | 'stripe' | 'play' | 'app_store'

export type SubscriptionScreenState =
  | 'loading'
  | 'load-failed'
  | 'stripe'
  | 'play'
  | 'app_store'
  | 'trial'
  | 'lifetime'
  | 'canceled'
  | 'past-due'
  | 'lapsed'
  | 'portal-opening'
  | 'portal-failed'
  | 'offline'
  | 'free'

export interface ResolveSubscriptionScreenInput {
  status: SubscriptionStatus | null
  isStatusLoading: boolean
  isStatusError: boolean
  isBillingLoading?: boolean
  isBillingError?: boolean
  canUseStripeBilling?: boolean
  billingStatus?: string | null
  cancelAtPeriodEnd?: boolean
  isOnline: boolean
  portalState?: SubscriptionPortalState
}

export interface SubscriptionScreenModel {
  state: SubscriptionScreenState
  content: SubscriptionScreenContent
  view: 'pitch' | 'manage'
  interval: 'monthly' | 'yearly' | null
  provider: 'stripe' | 'play' | 'app_store' | null
  isManageView: boolean
}

export function resolveUpgradeHeader(
  status: SubscriptionStatus | null,
  model: SubscriptionScreenModel,
  showPitch: boolean,
  canShowTitle = true,
): { lapsedNoticeStatus: SubscriptionStatus | null; titleKey: 'upgrade.title' | 'upgrade.pitchTitle' | null } {
  const lapsedNoticeStatus = status && !status.hasProAccess
    && (status.lapseReason || status.subscriptionEndedAtUtc) && !showPitch ? status : null
  const titleKey = !canShowTitle || (!status && model.state !== 'load-failed')
    ? null
    : model.state === 'load-failed' || lapsedNoticeStatus || model.content !== 'pitch'
      ? 'upgrade.title'
      : 'upgrade.pitchTitle'
  return { lapsedNoticeStatus, titleKey }
}

function resolvePitchState(status: SubscriptionStatus): SubscriptionScreenState {
  if (status.plan === 'pro' && status.isTrialActive) return 'trial'
  if (status.lapseReason || status.subscriptionEndedAtUtc) return 'lapsed'
  return 'free'
}

function resolveManageState(
  input: ResolveSubscriptionScreenInput,
  status: SubscriptionStatus,
): SubscriptionScreenState {
  if (input.portalState === 'opening') return 'portal-opening'
  if (input.portalState === 'failed') return 'portal-failed'
  if (status.isLifetimePro) return 'lifetime'
  const provider = status.billingProvider ?? status.source
  if (provider === 'play' || provider === 'app_store') return provider
  if (input.canUseStripeBilling === false) return 'stripe'
  if (input.isBillingLoading) return 'loading'
  if (input.isBillingError) return 'load-failed'
  if (input.cancelAtPeriodEnd) return 'canceled'
  if (input.billingStatus === 'past_due') return 'past-due'
  return 'stripe'
}

export function resolveSubscriptionScreen(
  input: ResolveSubscriptionScreenInput,
): SubscriptionScreenModel {
  const status = input.status
  const isManageView = Boolean(status?.hasProAccess && !status.isTrialActive)
  const provider = status?.billingProvider ?? status?.source ?? null
  const content: SubscriptionScreenContent = isManageView
    ? status?.isLifetimePro ? 'stripe' : provider ?? 'stripe'
    : 'pitch'
  const base = {
    content,
    interval: status?.subscriptionInterval ?? null,
    provider,
    isManageView,
    view: isManageView ? ('manage' as const) : ('pitch' as const),
  }

  if (!input.isOnline) return { ...base, state: 'offline' }
  if (input.isStatusLoading) return { ...base, state: 'loading' }
  if (input.isStatusError || !status) return { ...base, state: 'load-failed' }

  const state = isManageView ? resolveManageState(input, status) : resolvePitchState(status)
  return { ...base, state }
}

export function getSubscriptionBillingProvider(status: SubscriptionStatus | null): BillingProvider | null {
  return status?.billingProvider ?? status?.source ?? null
}

export function shouldFetchStripeBilling(status: SubscriptionStatus | null, platform: string): boolean {
  if (platform === 'ios' || !status?.hasProAccess || status.isTrialActive || status.isLifetimePro) return false
  const provider = getSubscriptionBillingProvider(status)
  return provider !== 'play' && provider !== 'app_store'
}
