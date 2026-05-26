import type { HabitFormHelpers } from "@/hooks/use-habit-form";
import { type AppTokens, createStyles } from "./styles";

export type HabitFormControl = HabitFormHelpers["form"]["control"];
export type HabitFormSetValue = HabitFormHelpers["form"]["setValue"];
export type HabitFormStyles = ReturnType<typeof createStyles>;

export interface SectionThemeProps {
  styles: HabitFormStyles;
  tokens: AppTokens;
}
