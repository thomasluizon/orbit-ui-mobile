/** Empty state: the real brand mark at 96px in --fg-1, with no arc and no accent on it, over one line of title and one clear action. The accent appears only on that action. Never hand-draw a mark here: the system has exactly three identity carriers (the orbital mark, the Astra glyph, ring indicators) and there is no separate satellite or illustration glyph. Always a composed invitation, never a blank region. */
export interface EmptyStateProps {
  title: string;
  /** the one clear next action, e.g. <Button size="sm">Criar meta</Button> */
  action?: any;
  /** which identity carrier heads the state: 'orbit' (default) or 'astra' for an Astra-owned surface */
  mark?: 'orbit' | 'astra';
  children?: any;
}
export declare function EmptyState(props: EmptyStateProps): any;
