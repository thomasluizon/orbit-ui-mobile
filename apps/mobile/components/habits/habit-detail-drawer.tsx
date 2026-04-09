import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  Clock,
  Bell,
  CalendarDays,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { HabitChecklist } from "./habit-checklist";
import { DescriptionViewer } from "./description-viewer";
import { HabitCalendar } from "./habit-calendar";
import {
  HabitDetailRecentNotes,
  HabitDetailStatsGrid,
} from "./habit-detail-sections";
import { useTimeFormat } from "@/hooks/use-time-format";
import {
  useHabitFullDetail,
  useUpdateChecklist,
  useLogHabit,
} from "@/hooks/use-habits";
import type { NormalizedHabit } from "@orbit/shared/types/habit";
import { radius } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  habit: NormalizedHabit | null;
  onLogged?: (habitId: string) => void;
}

type HabitDetailColors = {
  primary: string
  primary_10: string
  surfaceGround: string
  surface: string
  surfaceElevated: string
  borderMuted: string
  border: string
  textSecondary: string
  textPrimary: string
  textMuted: string
  textFaded: string
  white: string
}

type HabitDetailShadows = {
  sm: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitDetailDrawer({
  open,
  onClose,
  habit,
  onLogged,
}: Readonly<HabitDetailDrawerProps>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const dateFnsLocale = locale === "pt-BR" ? ptBR : enUS;
  const { displayTime } = useTimeFormat();
  const { colors, shadows } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, shadows),
    [colors, shadows],
  );
  const habitId = habit?.id ?? "";

  const { data: fullDetail, isLoading: metricsLoading } = useHabitFullDetail(
    open && habitId ? habitId : null,
  );
  const updateChecklist = useUpdateChecklist();
  const logHabit = useLogHabit();

  const metrics = fullDetail?.metrics ?? null;
  const logs = fullDetail?.logs ?? null;

  const [descriptionViewerOpen, setDescriptionViewerOpen] = useState(false);

  const recentNotes = useMemo(
    () =>
      (logs ?? [])
        .filter((log) => log.note)
        .slice(0, 5)
        .map((log) => ({
          id: log.id,
          note: log.note ?? "",
          dateLabel: format(
            new Date(log.date),
            locale === "pt-BR" ? "dd MMM yyyy" : "MMM d, yyyy",
            { locale: dateFnsLocale },
          ),
        })),
    [dateFnsLocale, locale, logs],
  );

  const handleChecklistToggle = useCallback(
    (index: number) => {
      if (!habit) return;
      const items = [...habit.checklistItems];
      const item = items[index];
      if (!item) return;
      items[index] = { ...item, isChecked: !item.isChecked };
      updateChecklist.mutate({ habitId: habit.id, items });
      if (items.every((i) => i.isChecked) && !habit.isCompleted) {
        Alert.alert(
          t("habits.checklistCompleteTitle"),
          t("habits.checklistCompleteMessage", { name: habit.title }),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("habits.checklistCompleteConfirm"),
              onPress: async () => {
                try {
                  await logHabit.mutateAsync({ habitId: habit.id });
                  onLogged?.(habit.id);
                } catch {
                  // Error handled by mutation
                }
              },
            },
          ],
        );
      }
    },
    [habit, updateChecklist, logHabit, onLogged, t],
  );

  const handleChecklistReset = useCallback(() => {
    if (!habit) return;
    const items = habit.checklistItems.map((i) => ({ ...i, isChecked: false }));
    updateChecklist.mutate({ habitId: habit.id, items });
  }, [habit, updateChecklist]);

  const handleChecklistClear = useCallback(() => {
    if (!habit) return;
    updateChecklist.mutate({ habitId: habit.id, items: [] });
  }, [habit, updateChecklist]);

  return (
    <>
      {habit?.description && (
        <DescriptionViewer
          open={descriptionViewerOpen}
          onClose={() => setDescriptionViewerOpen(false)}
          title={habit.title}
          description={habit.description}
        />
      )}

      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={habit?.title}
        snapPoints={["68%", "92%"]}
      >
        {habit && (
          <BottomSheetScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Description (expandable) */}
            {habit.description && (
              <TouchableOpacity
                onPress={() => setDescriptionViewerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.description} numberOfLines={2}>
                  {habit.description}
                </Text>
              </TouchableOpacity>
            )}

            {/* Due time */}
            {habit.dueTime && (
              <View style={styles.infoRow}>
                <Clock size={16} color={colors.primary} />
                <Text style={styles.infoText}>
                  {displayTime(habit.dueTime)}
                </Text>
              </View>
            )}

            {/* Scheduled reminders */}
            {habit.scheduledReminders &&
              habit.scheduledReminders.length > 0 && (
                <View style={styles.infoRow}>
                  <Bell size={16} color={colors.primary} />
                  <View style={styles.reminderChips}>
                    {habit.scheduledReminders.map((sr, idx) => (
                      <View
                        key={`${sr.when}-${sr.time}-${idx}`}
                        style={styles.reminderChip}
                      >
                        <Text style={styles.reminderChipText}>
                          {sr.when === "day_before"
                            ? t("habits.form.scheduledReminderDayBeforeAt", {
                                time: sr.time.slice(0, 5),
                              })
                            : t("habits.form.scheduledReminderSameDayAt", {
                                time: sr.time.slice(0, 5),
                              })}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

            {/* End date */}
            {habit.endDate && (
              <View style={styles.infoRow}>
                <CalendarDays size={16} color={colors.primary} />
                <Text style={styles.infoText}>
                  {t("habits.detail.endsOn")}{" "}
                  {format(
                    new Date(habit.endDate),
                    locale === "pt-BR" ? "dd MMM yyyy" : "MMM d, yyyy",
                    { locale: dateFnsLocale },
                  )}
                </Text>
              </View>
            )}

            {/* Checklist */}
            {habit.checklistItems && habit.checklistItems.length > 0 && (
              <HabitChecklist
                items={habit.checklistItems}
                interactive
                onToggle={handleChecklistToggle}
                onReset={handleChecklistReset}
                onClear={handleChecklistClear}
              />
            )}

            <HabitDetailStatsGrid
              metrics={metrics}
              loading={metricsLoading}
              t={t}
              colors={{
                primary: colors.primary,
                surfaceGround: colors.surfaceGround,
                borderMuted: colors.borderMuted,
                textSecondary: colors.textSecondary,
                textPrimary: colors.textPrimary,
              }}
              styles={{
                statsGrid: styles.statsGrid,
                statCard: styles.statCard,
                statLabel: styles.statLabel,
                statValue: styles.statValue,
                skeletonIcon: styles.skeletonIcon,
                skeletonLabel: styles.skeletonLabel,
                skeletonValue: styles.skeletonValue,
              }}
            />

            <View style={styles.calendarSection}>
              <Text style={styles.sectionTitle}>
                {t("habits.detail.activity")}
              </Text>
              <HabitCalendar habitId={habit.id} logs={logs} />
            </View>

            <HabitDetailRecentNotes
              notes={recentNotes}
              t={t}
              styles={{
                notesSection: styles.notesSection,
                sectionTitle: styles.sectionTitle,
                notesList: styles.notesList,
                noteCard: styles.noteCard,
                noteDate: styles.noteDate,
                noteText: styles.noteText,
              }}
            />

          </BottomSheetScrollView>
        )}
      </BottomSheetModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: HabitDetailColors,
  shadows: HabitDetailShadows,
) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      gap: 24,
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    infoText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    reminderChips: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    reminderChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.primary_10,
    },
    reminderChipText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.primary,
    },
    statsGrid: {
      flexDirection: "row",
      gap: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surfaceGround,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.xl,
      padding: 12,
      alignItems: "center",
      gap: 4,
      ...shadows.sm,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textSecondary,
      textAlign: "center",
    },
    statValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    skeletonIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
    },
    skeletonLabel: {
      width: 40,
      height: 10,
      borderRadius: 4,
      backgroundColor: colors.surfaceElevated,
    },
    skeletonValue: {
      width: 32,
      height: 20,
      borderRadius: 4,
      backgroundColor: colors.surfaceElevated,
    },
    notesSection: {
      gap: 12,
    },
    calendarSection: {
      gap: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    notesList: {
      gap: 8,
    },
    noteCard: {
      backgroundColor: colors.surfaceGround,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.md,
      padding: 12,
      ...shadows.sm,
    },
    noteDate: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
      marginBottom: 4,
    },
    noteText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
    },
    editButton: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    editButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    deleteButton: {
      flex: 2,
      paddingVertical: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.white,
    },
  });
}
