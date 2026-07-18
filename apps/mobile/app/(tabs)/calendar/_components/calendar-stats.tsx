import { StyleSheet, View } from "react-native";
import { StatTile } from "@/components/ui/stat-tile";

export interface CalendarStat {
  key: string;
  emoji: string;
  value: string | number;
  label: string;
}

interface CalendarStatsProps {
  stats: readonly CalendarStat[];
}

/** At-a-glance, data-driven month stat section: each entry renders as a kit StatTile
 *  in a wrapping 3-up grid so new stats drop in as array entries without a layout rewrite. */
export function CalendarStats({ stats }: Readonly<CalendarStatsProps>) {
  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.key} style={styles.cell}>
          <StatTile emoji={stat.emoji} value={stat.value} label={stat.label} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
  },
  cell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 96,
  },
});
