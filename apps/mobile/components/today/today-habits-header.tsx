import {
  memo,
  useState,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { PanGesture } from "react-native-gesture-handler";
import {
  Search,
  X,
  MoreVertical,
  CheckCircle2,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
  Check,
  Eye,
  Filter,
} from "lucide-react-native";
import { isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import type { Tag } from "@/hooks/use-tags";
import { AppTextInput } from "@/components/ui/app-text-input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TagChip } from "@/components/ui/tag-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { AnchoredMenu, MenuAnchorHost } from "@/components/ui/anchored-menu";
import { TodayAISummary } from "@/components/habits/today-ai-summary";
import { TodayDateNavigation } from "@/app/(tabs)/today-shell";
import type { MenuAnchorRect } from "@/lib/anchored-menu";
import {
  createAnimatedTimingConfig,
  usePrefersReducedMotion,
  useResolvedMotionPreset,
} from "@/lib/motion";
import { createTokensV2, tintFromPrimary } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type FreqKey = "Day" | "Week" | "Month" | "Year" | "none";
type TodayView = "today" | "all" | "general" | "goals";

interface TodaySearchBarProps {
  initialValue: string;
  onChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onCancel: () => void;
  placeholder: string;
  clearLabel: string;
  closeLabel: string;
  focused: boolean;
  tokens: ReturnType<typeof createTokensV2>;
  styles: ReturnType<typeof createStyles>;
}

const TodaySearchBar = memo(function TodaySearchBar({
  initialValue,
  onChange,
  onFocusChange,
  onCancel,
  placeholder,
  clearLabel,
  closeLabel,
  focused,
  tokens,
  styles,
}: Readonly<TodaySearchBarProps>) {
  const [draft, setDraft] = useState(initialValue);
  const focusMotion = useResolvedMotionPreset("selection");
  const [focusAnim] = useState(() => new Animated.Value(focused ? 1 : 0));

  const [previousInitialValue, setPreviousInitialValue] = useState(initialValue);
  if (initialValue !== previousInitialValue) {
    setPreviousInitialValue(initialValue);
    setDraft(initialValue);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(draft);
    }, 300);

    return () => clearTimeout(timer);
  }, [draft, onChange]);

  useEffect(() => {
    Animated.timing(focusAnim, {
      ...createAnimatedTimingConfig(
        focused ? focusMotion.enterDuration : focusMotion.exitDuration,
        focused ? focusMotion.enterEasing : focusMotion.exitEasing,
      ),
      toValue: focused ? 1 : 0,
    }).start();
  }, [focusAnim, focusMotion, focused]);

  const focusAnimatedStyle = useMemo(
    () => ({
      opacity: focusAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1],
      }),
    }),
    [focusAnim],
  );

  return (
    <Animated.View style={[styles.searchRow, focusAnimatedStyle]}>
      <View
        style={[
          styles.searchWrap,
          { borderColor: focused ? tokens.primary : tokens.hairline },
        ]}
      >
        <Search size={18} color={tokens.fg3} strokeWidth={1.8} />
        <AppTextInput
          style={[styles.searchInput, { color: tokens.fg1 }]}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={placeholder}
          placeholderTextColor={tokens.fg3}
          returnKeyType="search"
          selectionColor={tokens.primary}
        />
        <Pressable
          onPress={() => {
            if (draft.length > 0) {
              setDraft("");
              return;
            }
            onCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel={draft.length > 0 ? clearLabel : closeLabel}
          hitSlop={8}
          style={({ pressed }) => [
            styles.searchClear,
            pressed ? { backgroundColor: tokens.bgSunk } : null,
          ]}
        >
          <X size={16} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
      </View>
    </Animated.View>
  );
});

interface TodayHabitsHeaderProps {
  header: ReactNode;
  showSummary: boolean;
  dateStr: string;
  currentActiveView: TodayView;
  dateLabel: string;
  selectedDate: Date;
  slideDirection: "left" | "right";
  dateLabelAnim: Animated.Value;
  isSearchFocused: boolean;
  swipeGesture?: PanGesture;
  showDayProgress: boolean;
  dayProgress: { done: number; total: number };
  isSearchOpen: boolean;
  searchQuery: string;
  selectedFrequency: FreqKey | null;
  selectedTagIds: string[];
  tags: Tag[];
  frequencyOptions: { key: FreqKey; label: string }[];
  isSelectMode: boolean;
  showCompleted: boolean;
  isFetching: boolean;
  allCollapsed: boolean;
  showControlsMenu: boolean;
  controlsMenuAnchorRect: MenuAnchorRect | null;
  showFreqMenu: boolean;
  freqMenuAnchorRect: MenuAnchorRect | null;
  controlsButtonRef: React.RefObject<View | null>;
  freqMenuButtonRef: React.RefObject<View | null>;
  filtersAnimatedStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  onGoToPreviousDay: () => void;
  onGoToToday: () => void;
  onGoToNextDay: () => void;
  onSearchToggle: () => void;
  onSearchChange: (value: string) => void;
  onSearchFocusChange: (focused: boolean) => void;
  onTagToggle: (tagId: string) => void;
  onToggleFreqMenu: () => void;
  onToggleControlsMenu: () => void;
  onCloseControlsMenu: () => void;
  onCloseFreqMenu: () => void;
  onToggleSelect: () => void;
  onToggleCollapse: () => void;
  onRefresh: () => void;
  onToggleCompleted: () => void;
  onSelectFrequency: (key: FreqKey | null) => void;
}

/** Habit-view header: AI summary, date nav, the section label with search/filter/controls
 *  triggers, day-progress bar, and the filters shell (search bar + tag chips + anchored menus). */
export function TodayHabitsHeader({
  header,
  showSummary,
  dateStr,
  currentActiveView,
  dateLabel,
  selectedDate,
  slideDirection,
  dateLabelAnim,
  isSearchFocused,
  swipeGesture,
  showDayProgress,
  dayProgress,
  isSearchOpen,
  searchQuery,
  selectedFrequency,
  selectedTagIds,
  tags,
  frequencyOptions,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  showControlsMenu,
  controlsMenuAnchorRect,
  showFreqMenu,
  freqMenuAnchorRect,
  controlsButtonRef,
  freqMenuButtonRef,
  filtersAnimatedStyle,
  onGoToPreviousDay,
  onGoToToday,
  onGoToNextDay,
  onSearchToggle,
  onSearchChange,
  onSearchFocusChange,
  onTagToggle,
  onToggleFreqMenu,
  onToggleControlsMenu,
  onCloseControlsMenu,
  onCloseFreqMenu,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onSelectFrequency,
}: Readonly<TodayHabitsHeaderProps>) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(theme.currentScheme, theme.currentTheme),
    [theme.currentScheme, theme.currentTheme],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const refreshSpinAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!isFetching || prefersReducedMotion) {
      refreshSpinAnim.stopAnimation?.();
      refreshSpinAnim.setValue(0);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(refreshSpinAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinLoop.start();
    return () => spinLoop.stop();
  }, [isFetching, prefersReducedMotion, refreshSpinAnim]);

  const refreshSpinStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: refreshSpinAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "360deg"],
          }),
        },
      ],
    }),
    [refreshSpinAnim],
  );

  return (
    <>
      {header}

      {showSummary ? <TodayAISummary date={dateStr} /> : null}

      <TodayDateNavigation
        visible={currentActiveView === "today"}
        dateLabel={dateLabel}
        isTodaySelected={isToday(selectedDate)}
        slideDirection={slideDirection}
        onGoToPreviousDay={onGoToPreviousDay}
        onGoToToday={onGoToToday}
        onGoToNextDay={onGoToNextDay}
        previousLabel={t("dates.previousDay")}
        todayLabel={t("dates.goToToday")}
        nextLabel={t("dates.nextDay")}
        dateLabelAnim={dateLabelAnim}
        swipeGesture={!isSearchFocused ? swipeGesture : undefined}
      />

      <SectionLabel
        top={20}
        bottom={showDayProgress ? 6 : 0}
        trailing={
          <View style={styles.sectionTrailing}>
            {showDayProgress ? (
              <Text style={styles.dayProgressCount}>
                {dayProgress.done}/{dayProgress.total}
              </Text>
            ) : null}
            <Pressable
              onPress={onSearchToggle}
              accessibilityRole="button"
              accessibilityLabel={t("habits.searchPlaceholder")}
              hitSlop={6}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed
                  ? [styles.iconBtnPressed, { backgroundColor: tokens.bgElev }]
                  : null,
              ]}
            >
              <Search
                size={18}
                color={isSearchOpen ? tokens.fg1 : tokens.fg2}
                strokeWidth={1.8}
              />
            </Pressable>
            {currentActiveView !== "general" ? (
              <MenuAnchorHost anchorRef={freqMenuButtonRef}>
                <Pressable
                  onPress={onToggleFreqMenu}
                  accessibilityRole="button"
                  accessibilityLabel={t("habits.frequencyFilter")}
                  accessibilityState={{ selected: selectedFrequency != null }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.iconBtn,
                    selectedFrequency != null
                      ? {
                          backgroundColor: tokens.selectionBg,
                          borderWidth: 1,
                          borderColor: tintFromPrimary(tokens, 0.45),
                        }
                      : pressed
                        ? { backgroundColor: tokens.bgElev }
                        : null,
                    pressed ? styles.iconBtnPressed : null,
                  ]}
                >
                  <Filter
                    size={18}
                    color={
                      selectedFrequency != null ? tokens.primary : tokens.fg2
                    }
                    strokeWidth={1.8}
                  />
                </Pressable>
              </MenuAnchorHost>
            ) : null}
            <MenuAnchorHost anchorRef={controlsButtonRef}>
              <Pressable
                onPress={onToggleControlsMenu}
                accessibilityRole="button"
                accessibilityLabel={t("habits.actions.more")}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed
                    ? [styles.iconBtnPressed, { backgroundColor: tokens.bgElev }]
                    : null,
                ]}
              >
                <MoreVertical size={18} color={tokens.fg2} strokeWidth={1.8} />
              </Pressable>
            </MenuAnchorHost>
          </View>
        }
      >
        {t("habits.sectionLabel")}
      </SectionLabel>

      {showDayProgress ? (
        <View style={styles.dayProgressWrap}>
          <ProgressBar
            progress={dayProgress.done / dayProgress.total}
            label={`${dayProgress.done}/${dayProgress.total} ${t("habits.completed")}`}
          />
        </View>
      ) : null}

      <Animated.View
        testID="today-filters-shell"
        style={[styles.filtersShell, filtersAnimatedStyle]}
      >
        {isSearchOpen ? (
          <TodaySearchBar
            initialValue={searchQuery}
            onChange={onSearchChange}
            onFocusChange={onSearchFocusChange}
            onCancel={onSearchToggle}
            placeholder={t("habits.searchPlaceholder")}
            clearLabel={t("common.clear")}
            closeLabel={t("habits.closeSearch")}
            focused={isSearchFocused}
            tokens={tokens}
            styles={styles}
          />
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              active={selectedTagIds.includes(tag.id)}
              onPress={() => onTagToggle(tag.id)}
            />
          ))}
        </ScrollView>

        <AnchoredMenu
          visible={showControlsMenu}
          anchorRect={controlsMenuAnchorRect}
          onClose={onCloseControlsMenu}
          width={220}
          estimatedHeight={220}
        >
          <Pressable
            style={({ pressed }) => [
              styles.controlsMenuItem,
              {
                backgroundColor: pressed ? tokens.bgSunk : "transparent",
              },
            ]}
            onPress={onToggleSelect}
            accessibilityRole="button"
          >
            {isSelectMode ? (
              <X size={16} color={tokens.fg2} strokeWidth={1.8} />
            ) : (
              <CheckCircle2 size={16} color={tokens.fg2} strokeWidth={1.8} />
            )}
            <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
              {isSelectMode ? t("common.cancel") : t("common.select")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.controlsMenuItem,
              {
                backgroundColor: pressed ? tokens.bgSunk : "transparent",
              },
            ]}
            onPress={onToggleCollapse}
            accessibilityRole="button"
          >
            {allCollapsed ? (
              <ChevronsUpDown size={16} color={tokens.fg2} strokeWidth={1.8} />
            ) : (
              <ChevronsDownUp size={16} color={tokens.fg2} strokeWidth={1.8} />
            )}
            <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
              {allCollapsed ? t("habits.expandAll") : t("habits.collapseAll")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.controlsMenuItem,
              isFetching ? styles.controlsMenuItemDisabled : null,
              {
                backgroundColor: pressed ? tokens.bgSunk : "transparent",
              },
            ]}
            onPress={onRefresh}
            disabled={isFetching}
            accessibilityRole="button"
            accessibilityState={{ disabled: isFetching }}
          >
            <Animated.View
              style={
                isFetching && !prefersReducedMotion ? refreshSpinStyle : null
              }
            >
              <RefreshCw size={16} color={tokens.fg2} strokeWidth={1.8} />
            </Animated.View>
            <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
              {t("habits.refresh")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.controlsMenuItem,
              {
                backgroundColor: pressed ? tokens.bgSunk : "transparent",
              },
            ]}
            onPress={onToggleCompleted}
            accessibilityRole="button"
          >
            {showCompleted ? (
              <Check size={16} color={tokens.fg2} strokeWidth={1.8} />
            ) : (
              <Eye size={16} color={tokens.fg2} strokeWidth={1.8} />
            )}
            <Text style={[styles.controlsMenuLabel, { color: tokens.fg1 }]}>
              {t("habits.showCompleted")}
            </Text>
          </Pressable>
        </AnchoredMenu>

        <AnchoredMenu
          visible={showFreqMenu}
          anchorRect={freqMenuAnchorRect}
          onClose={onCloseFreqMenu}
          width={200}
          estimatedHeight={260}
        >
          <Pressable
            style={({ pressed }) => [
              styles.controlsMenuItem,
              {
                backgroundColor: pressed ? tokens.bgSunk : "transparent",
              },
            ]}
            onPress={() => onSelectFrequency(null)}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: !selectedFrequency }}
          >
            <View style={styles.freqMenuCheck}>
              {!selectedFrequency ? (
                <Check size={16} color={tokens.primary} strokeWidth={2} />
              ) : null}
            </View>
            <Text
              style={[
                styles.controlsMenuLabel,
                {
                  color: !selectedFrequency ? tokens.fg1 : tokens.fg2,
                  fontFamily: !selectedFrequency
                    ? "Rubik_600SemiBold"
                    : "Rubik_500Medium",
                },
              ]}
            >
              {t("common.all")}
            </Text>
          </Pressable>
          {frequencyOptions.map((opt) => {
            const active = selectedFrequency === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [
                  styles.controlsMenuItem,
                  {
                    backgroundColor: pressed ? tokens.bgSunk : "transparent",
                  },
                ]}
                onPress={() => onSelectFrequency(active ? null : opt.key)}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.freqMenuCheck}>
                  {active ? (
                    <Check size={16} color={tokens.primary} strokeWidth={2} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.controlsMenuLabel,
                    {
                      color: active ? tokens.fg1 : tokens.fg2,
                      fontFamily: active
                        ? "Rubik_600SemiBold"
                        : "Rubik_500Medium",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </AnchoredMenu>
      </Animated.View>
    </>
  );
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    filtersShell: {
      paddingBottom: 8,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      marginVertical: 8,
    },
    searchWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: tokens.bgElev,
      paddingLeft: 16,
      paddingRight: 8,
    },
    searchClear: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderWidth: 0,
      borderRadius: 0,
      backgroundColor: "transparent",
      paddingHorizontal: 0,
      paddingVertical: 0,
      fontFamily: "Rubik_400Regular",
      fontSize: 15,
    },
    filtersContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 4,
    },
    freqMenuCheck: {
      width: 16,
      alignItems: "center",
      justifyContent: "center",
    },

    sectionTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dayProgressCount: {
      fontFamily: "Roboto_400Regular",
      fontSize: 12,
      letterSpacing: 0.24,
      color: tokens.fg3,
      fontVariant: ["tabular-nums"],
      marginRight: 6,
    },
    dayProgressWrap: {
      paddingHorizontal: 20,
      paddingBottom: 6,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnPressed: {
      transform: [{ scale: 0.96 }],
    },

    controlsMenuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    controlsMenuItemDisabled: {
      opacity: 0.5,
    },
    controlsMenuLabel: {
      fontFamily: "Rubik_500Medium",
      fontSize: 14,
    },
  });
}
