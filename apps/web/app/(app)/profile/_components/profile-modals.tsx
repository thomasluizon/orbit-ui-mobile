'use client'

import type { Profile } from '@orbit/shared/types/profile'
import { EditNameSheet } from './edit-name-sheet'
import { FreshStartModal } from './fresh-start-modal'
import { DeleteAccountModal } from './delete-account-modal'
import { TourReplayModal } from '@/components/tour/tour-replay-modal'

interface ProfileModalsProps {
  profile?: Profile
  showEditName: boolean
  showResetModal: boolean
  showDeleteModal: boolean
  showTourReplay: boolean
  onEditNameChange: (open: boolean) => void
  onResetChange: (open: boolean) => void
  onDeleteChange: (open: boolean) => void
  onTourReplayChange: (open: boolean) => void
}

// react-doctor-disable-next-line no-many-boolean-props -- private single-use modal aggregator; each flag independently gates one modal's visibility, not a combinatorial API https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function ProfileModals({
  profile,
  showEditName,
  showResetModal,
  showDeleteModal,
  showTourReplay,
  onEditNameChange,
  onResetChange,
  onDeleteChange,
  onTourReplayChange,
}: Readonly<ProfileModalsProps>) {
  return (
    <>
      <EditNameSheet open={showEditName} onOpenChange={onEditNameChange} />
      <FreshStartModal open={showResetModal} onOpenChange={onResetChange} />
      <DeleteAccountModal
        open={showDeleteModal}
        onOpenChange={onDeleteChange}
        profile={profile}
      />
      <TourReplayModal open={showTourReplay} onOpenChange={onTourReplayChange} />
    </>
  )
}
