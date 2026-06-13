import type { HabitFormHelpers } from "@/hooks/use-habit-form";
import { createStyles } from "./styles";

export type HabitFormControl = HabitFormHelpers["form"]["control"];
export type HabitFormSetValue = HabitFormHelpers["form"]["setValue"];
export type HabitFormStyles = ReturnType<typeof createStyles>;
