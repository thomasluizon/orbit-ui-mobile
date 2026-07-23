import { useTranslation } from "react-i18next";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { plural } from "@/lib/plural";
import { CreateHabitModal } from "@/components/habits/create-habit-modal";
import { HabitDetailDrawer } from "@/components/habits/habit-detail-drawer";
import { EditHabitModal } from "@/components/habits/edit-habit-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { ReferralDrawer } from "@/components/referral/referral-drawer";

interface TodayModalsProps {
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  createInitialDate: string | null;
  detailHabit: NormalizedHabit | null;
  onCloseDetail: () => void;
  onHabitLogged: (habitId: string) => void;
  editHabit: NormalizedHabit | null;
  editHabitParentIsGeneral: boolean | null;
  onCloseEdit: () => void;
  editHabitOnSaved: (() => void | Promise<void>) | null;
  showBulkDeleteConfirm: boolean;
  onBulkDeleteOpenChange: (open: boolean) => void;
  onConfirmBulkDelete: () => void;
  showBulkLogConfirm: boolean;
  onBulkLogOpenChange: (open: boolean) => void;
  onConfirmBulkLog: () => void;
  showBulkSkipConfirm: boolean;
  onBulkSkipOpenChange: (open: boolean) => void;
  onConfirmBulkSkip: () => void;
  selectedCount: number;
  showCreateGoalModal: boolean;
  onCloseCreateGoal: () => void;
  showReferral: boolean;
  onCloseReferral: () => void;
}

/**
 * Renders the Today screen's overlay layer: the create/edit/detail habit
 * surfaces, the bulk-action confirm dialogs, the create-goal modal,
 * and the referral drawer. Presentational — extracted from TodayScreen unchanged.
 */
// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational modal aggregator: each boolean is an independent modal/confirm visibility flag owned by TodayScreen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function TodayModals({
  showCreateModal,
  onCloseCreateModal,
  createInitialDate,
  detailHabit,
  onCloseDetail,
  onHabitLogged,
  editHabit,
  editHabitParentIsGeneral,
  onCloseEdit,
  editHabitOnSaved,
  showBulkDeleteConfirm,
  onBulkDeleteOpenChange,
  onConfirmBulkDelete,
  showBulkLogConfirm,
  onBulkLogOpenChange,
  onConfirmBulkLog,
  showBulkSkipConfirm,
  onBulkSkipOpenChange,
  onConfirmBulkSkip,
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

      <HabitDetailDrawer
        open={!!detailHabit}
        onClose={onCloseDetail}
        habit={detailHabit}
        onLogged={onHabitLogged}
      />

      <EditHabitModal
        open={!!editHabit}
        onClose={onCloseEdit}
        habit={editHabit}
        onSaved={editHabitOnSaved ?? undefined}
        parentIsGeneral={editHabitParentIsGeneral}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={onBulkDeleteOpenChange}
        title={t("habits.bulkDeleteTitle")}
        description={plural(
          t("habits.bulkDeleteMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkDeleteConfirm")}
        onConfirm={onConfirmBulkDelete}
        variant="danger"
      />

      <ConfirmDialog
        open={showBulkLogConfirm}
        onOpenChange={onBulkLogOpenChange}
        title={t("habits.bulkLogTitle")}
        description={plural(
          t("habits.bulkLogMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkLogConfirm")}
        onConfirm={onConfirmBulkLog}
        variant="success"
      />

      <ConfirmDialog
        open={showBulkSkipConfirm}
        onOpenChange={onBulkSkipOpenChange}
        title={t("habits.bulkSkipTitle")}
        description={plural(
          t("habits.bulkSkipMessage", { count: selectedCount }),
          selectedCount,
        )}
        confirmLabel={t("habits.bulkSkipConfirm")}
        onConfirm={onConfirmBulkSkip}
        variant="warning"
      />

      <CreateGoalModal open={showCreateGoalModal} onClose={onCloseCreateGoal} />

      <ReferralDrawer open={showReferral} onClose={onCloseReferral} />
    </>
  );
}
