'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { EditHandleSheet } from './edit-handle-sheet'

/** Persistent "@handle" row on the Social screen with an edit affordance — the only post-opt-in surface for the handle. */
export function SocialIdentityBar() {
  const t = useTranslations()
  const { profile } = useProfile()
  const [showEdit, setShowEdit] = useState(false)
  const handle = profile?.handle

  if (!handle) return null

  return (
    <div className="px-5" style={{ paddingBottom: 8 }}>
      <div
        className="flex items-center rounded-[16px]"
        style={{
          gap: 12,
          padding: '12px 14px 12px 16px',
          background: 'var(--bg-elev)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--fg-1)',
            }}
          >
            @{handle}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
            {t('social.identity.caption')}
          </div>
        </div>
        <button
          type="button"
          className="chip"
          onClick={() => setShowEdit(true)}
          aria-label={t('social.identity.editAria')}
        >
          <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('social.identity.edit')}</span>
        </button>
      </div>

      <EditHandleSheet open={showEdit} onOpenChange={setShowEdit} />
    </div>
  )
}
