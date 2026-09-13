import { StyleSheet, View } from "react-native";
import { StatTile } from "@/components/ui/stat-tile";

export interface CalendarStat {
  key: string;
  value: string | number;
  label: string;
}

interface CalendarStatsProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat];
  state?: 'default' | 'loading' | 'empty';
  loadingLabel?: string;
  emptyLabel?: string;
}

/** The three month figures, kept in one row at every width. */
export function CalendarStats({
  stats,
  state = 'default',
  loadingLabel,
  emptyLabel,
}: Readonly<CalendarStatsProps>) {
  return (
    <View testID="calendar-stats" style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.key} style={styles.cell}>
          {state === 'loading' ? (
            <StatTile state="loading" loadingLabel={loadingLabel ?? ''} label={stat.label} />
          ) : state === 'empty' ? (
            <StatTile state="empty" emptyLabel={emptyLabel ?? ''} label={stat.label} />
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
