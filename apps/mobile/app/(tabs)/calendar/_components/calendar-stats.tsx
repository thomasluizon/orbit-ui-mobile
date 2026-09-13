import { StyleSheet, View } from "react-native";
import { StatTile } from "@/components/ui/stat-tile";

export interface CalendarStat {
  key: string;
  value: string | number;
  label: string;
}

interface CalendarStatsProps {
  stats: readonly [CalendarStat, CalendarStat, CalendarStat];
}

/** The three month figures, kept in one row at every width. */
export function CalendarStats({ stats }: Readonly<CalendarStatsProps>) {
  return (
    <View testID="calendar-stats" style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.key} style={styles.cell}>
          <StatTile value={stat.value} label={stat.label} />
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
