import { useTranslation } from "react-i18next";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { plural } from "@/lib/plural";
import { EditHabitModal } from "@/components/habits/edit-habit-modal";

import { ReferralDrawer } from "@/components/referral/referral-drawer";
import { ConfirmSheet } from '@/components/ui/confirm-sheet'

interface TodayModalsProps {
  editHabit: NormalizedHabit | null;
  editHabitParentIsGeneral: boolean | null;
  onCloseEdit: () => void;
  editHabitOnSaved: (() => void | Promise<void>) | null;
  showBulkDeleteConfirm: boolean;
  onBulkDeleteOpenChange: (open: boolean) => void;
  onConfirmBulkDelete: () => void;
  selectedCount: number;
  showReferral: boolean;
  onCloseReferral: () => void;
}

/**
 * Renders the Today screen's overlay layer: the edit habit surface,
 * the bulk-action confirm dialog and the referral drawer. The root
 * layout owns the create navigation, so a press works before Today mounts.
 */
// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational modal aggregator: each boolean is an independent modal/confirm visibility flag owned by TodayScreen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function TodayModals({
  editHabit,
  editHabitParentIsGeneral,
  onCloseEdit,
  editHabitOnSaved,
  showBulkDeleteConfirm,
  onBulkDeleteOpenChange,
  onConfirmBulkDelete,
  selectedCount,
  showReferral,
  onCloseReferral,
}: Readonly<TodayModalsProps>) {
  const { t } = useTranslation();
  return (
    <>
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

      <ReferralDrawer open={showReferral} onClose={onCloseReferral} />
    </>
  );
}
