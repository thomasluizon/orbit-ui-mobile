import { useTranslation } from "react-i18next";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { plural } from "@/lib/plural";
import { CreateHabitModal } from "@/components/habits/create-habit-modal";
import { EditHabitModal } from "@/components/habits/edit-habit-modal";

import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { ReferralDrawer } from "@/components/referral/referral-drawer";
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface TodayModalsProps {
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  createInitialDate: string | null;
  editHabit: NormalizedHabit | null;
  editHabitParentIsGeneral: boolean | null;
  onCloseEdit: () => void;
  editHabitOnSaved: (() => void | Promise<void>) | null;
  showBulkDeleteConfirm: boolean;
  onBulkDeleteOpenChange: (open: boolean) => void;
  onConfirmBulkDelete: () => void;
  selectedCount: number;
  showCreateGoalModal: boolean;
  onCloseCreateGoal: () => void;
  showReferral: boolean;
  onCloseReferral: () => void;
}

/**
 * Renders the Today screen's overlay layer: the create/edit habit
 * surfaces, the bulk-action confirm dialogs, the create-goal modal,
 * and the referral drawer. Presentational, extracted from TodayScreen unchanged.
 */
// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational modal aggregator: each boolean is an independent modal/confirm visibility flag owned by TodayScreen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function TodayModals({
  showCreateModal,
  onCloseCreateModal,
  createInitialDate,
  editHabit,
  editHabitParentIsGeneral,
  onCloseEdit,
  editHabitOnSaved,
  showBulkDeleteConfirm,
  onBulkDeleteOpenChange,
  onConfirmBulkDelete,
  selectedCount,
  showCreateGoalModal,
  onCloseCreateGoal,
  showReferral,
  onCloseReferral,
}: Readonly<TodayModalsProps>) {
  const { t } = useTranslation();

  return (
    <>
      <CreateHabitModal
        open={showCreateModal}
        onClose={onCloseCreateModal}
        initialDate={createInitialDate}
      />

      <EditHabitModal
        open={!!editHabit}
        onClose={onCloseEdit}
        habit={editHabit}
        onSaved={editHabitOnSaved ?? undefined}
        parentIsGeneral={editHabitParentIsGeneral}
      />

      <ConfirmSheet
        open={showBulkDeleteConfirm}
        title={t("habits.bulkDeleteTitle")}
        message={plural(t("habits.bulkDeleteMessage", { count: selectedCount }), selectedCount)}
        confirmLabel={t("habits.bulkDeleteConfirm")}
        destructive
        onCancel={() => onBulkDeleteOpenChange(false)}
        onConfirm={() => {
          onBulkDeleteOpenChange(false)
          onConfirmBulkDelete()
        }}
      />

      <CreateGoalModal open={showCreateGoalModal} onClose={onCloseCreateGoal} />

      <ReferralDrawer open={showReferral} onClose={onCloseReferral} />
    </>
  );
}
