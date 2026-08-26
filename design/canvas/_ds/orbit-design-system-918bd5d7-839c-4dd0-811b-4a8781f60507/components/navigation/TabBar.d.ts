/** Bottom tab bar. The active tab is a current-position accent role (label in --primary-soft, icon filled).
 *  --primary-soft is accent TEXT and is canvas only (4.58:1 on canvas, 4.28:1 on a card): this bar must
 *  sit on the canvas, never on a raised surface.
 *  **Exactly four destinations: Hoje, Calendario, Progresso, Perfil** (D69, 2026-08-16). There is no Astra
 *  tab: Astra is a layer with a front door, and its front door is the Composer sitting above this bar on
 *  every one of the four. The `astra` flag on an item is dead and must not be passed. */
export interface TabBarProps {
  items: Array<{ id: string; label: string; icon?: string }>;
  activeId?: string;
  onSelect?: (id: string) => void;
}
export declare function TabBar(props: TabBarProps): any;
