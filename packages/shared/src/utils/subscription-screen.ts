import type { SubscriptionStatus } from '../types/profile'

export type SubscriptionPortalState = 'idle' | 'opening' | 'failed'

export type SubscriptionScreenContent = 'pitch' | 'stripe' | 'play'

export type SubscriptionScreenState =
  | 'loading'
  | 'load-failed'
  | 'stripe'
  | 'play'
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
  provider: 'stripe' | 'play' | null
  isManageView: boolean
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
  if (status.source === 'play') return 'play'
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
  const content: SubscriptionScreenContent = isManageView
    ? status?.source === 'play' && !status.isLifetimePro
      ? 'play'
      : 'stripe'
    : 'pitch'
  const base = {
    content,
    interval: status?.subscriptionInterval ?? null,
    provider: status?.source ?? null,
    isManageView,
    view: isManageView ? ('manage' as const) : ('pitch' as const),
  }

  if (!input.isOnline) return { ...base, state: 'offline' }
  if (input.isStatusLoading) return { ...base, state: 'loading' }
  if (input.isStatusError || !status) return { ...base, state: 'load-failed' }

  const state = isManageView ? resolveManageState(input, status) : resolvePitchState(status)
  return { ...base, state }
}
