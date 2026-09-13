import { StyleSheet, View } from "react-native";
import { StatTile } from "@/components/ui/stat-tile";

export interface CalendarStat {
  key: string;
  value: string | number;
  label: string;
}

interface CalendarStatsBaseProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat];
}

type CalendarStatsProps = CalendarStatsBaseProps & (
  | { state?: "default"; loadingLabel?: never }
  | { state: "loading"; loadingLabel: string }
);

/** The three month figures, kept in one row at every width. */
export function CalendarStats(props: Readonly<CalendarStatsProps>) {
  const isLoading = props.state === "loading";

  return (
    <View
      accessibilityElementsHidden={isLoading || undefined}
      importantForAccessibility={isLoading ? "no-hide-descendants" : undefined}
      testID="calendar-stats"
      style={styles.row}
    >
      {props.stats.map((stat) => (
        <View key={stat.key} style={styles.cell}>
          {isLoading ? (
            <StatTile state="loading" label="" loadingLabel={props.loadingLabel} />
          ) : (
            <StatTile value={stat.value} label={stat.label} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
