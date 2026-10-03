/** Bottom tab bar. The active tab is a current-position accent role (label in --primary-soft, icon filled).
 *  Height 80 above the gesture inset, with a 56x32 padded indicator around a 24 icon.
 *  Indicator then 4 gap and a 12/500 label on a 16 line, with 14 above and below.
 *  Active icon is filled; Progresso uses layout-dashboard. Labels never wrap or ellipsize.
 *  Reselecting the active root scrolls it to the top.
 *  --primary-soft is accent TEXT and is canvas only (4.58:1 on canvas, 4.28:1 on a card): this bar must
 *  sit on the canvas, never on a raised surface.
 *  **Exactly four destinations: Hoje, Calendario, Progresso, Perfil** (D69). There is no Astra
 *  tab: Astra is a layer with a front door, and its front door is the Composer sitting above this bar on
 *  Hoje only. The `astra` flag on an item is dead and must not be passed. */
export interface TabBarProps {
  items: Array<{ id: string; label: string; icon?: string }>;
  activeId?: string;
  onSelect?: (id: string) => void;
}
export declare function TabBar(props: TabBarProps): any;
