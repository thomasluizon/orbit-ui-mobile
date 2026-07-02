'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight, Users, X } from 'lucide-react'
import { plural } from '@/lib/plural'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useFriends } from '@/hooks/use-friends'
import { useProfile } from '@/hooks/use-profile'

/**
 * Today entry to the Social hub. Shows an actionable "friend requests waiting"
 * card whenever requests are pending; otherwise a one-time dismissible
 * "connect with friends" invitation. Renders unconditionally, visibility is
 * arbitrated by useEngagementSlot.
 */
export function SocialEntryCard() {
  const t = useTranslations()
  const router = useRouter()
  const { profile } = useProfile()
  const socialOptIn = profile?.socialOptIn ?? false
  const { data } = useFriends({ enabled: socialOptIn })
  const pendingRequests = data?.incomingRequests.length ?? 0
  const dismissSocialEntry = useEngagementPromptStore((s) => s.dismissSocialEntry)

  const hasRequests = pendingRequests > 0

  const title = hasRequests
    ? t('social.today.requestsTitle')
    : t('social.today.entryTitle')
  const subtitle = hasRequests
    ? plural(t('social.today.requestsSubtitle', { count: pendingRequests }), pendingRequests)
    : t('social.today.entrySubtitle')

  return (
    <div style={{ padding: '6px 20px' }}>
      <div className="relative">
        <button
          type="button"
          onClick={() => router.push(hasRequests ? '/social?tab=friends' : '/social')}
          className="card-int flex w-full appearance-none items-center border-0 text-left"
          style={{ padding: '14px 16px', gap: 14, paddingRight: hasRequests ? 16 : 52 }}
        >
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{
              width: 44,
              height: 44,
              background: 'rgba(var(--primary-rgb), 0.15)',
            }}
          >
            <Users size={22} strokeWidth={1.8} color="var(--primary-soft)" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: hasRequests ? 'var(--fg-2)' : 'var(--fg-3)',
              }}
            >
              {subtitle}
            </span>
          </span>
          {hasRequests && (
            <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-4)" />
          )}
        </button>
        {!hasRequests && (
          <button
            type="button"
            onClick={dismissSocialEntry}
            aria-label={t('common.dismiss')}
            className="absolute flex appearance-none items-center justify-center rounded-full border-0 bg-transparent"
            style={{
              top: '50%',
              right: 14,
              transform: 'translateY(-50%)',
              width: 28,
              height: 28,
              cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={1.8} color="var(--fg-4)" />
          </button>
        )}
      </div>
    </div>
  )
}
