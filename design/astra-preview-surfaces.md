# Astra preview surfaces

The conversation lets a person inspect each proposed item before approving a write.
The granted Astra conversation canvas defines the item rows, action order and outcomes.

| Surface | Web and Android behavior |
| --- | --- |
| Pending item preview | One named row per item with a localized cadence, date or time; irreversible changes retain their mark. |
| Compact preview actions | Primary Approve, ghost Edit, a spacer and ghost Reject on one row at the drawn width; whole controls reflow below 360px. |
| Wide preview actions | Secondary Approve, ghost Edit, a spacer and ghost Reject on one row. |
| Item editing sheet | Existing typed editing, per-item removal and batch revision remain available. |
| Irreversible confirmation and identity verification | Existing confirmation and verification remain required before execution. |
| Busy, saved and failed preview | Existing progress, completed-target navigation and retry remain available. |
| Stale preview | Existing refresh and unavailable states remain available. |
| Rejected preview | Rows and actions collapse to the counted rejection sentence stating that nothing was saved. |
| Habit list pagination | The ghost Show more control hugs its content and reveals the next page in place. |
| Assistant introduction | Model prose remains intact; repeated confirmation requests require an API prompt change. |

Field diff labels, raw enums and redundant item names are removed from preview rows.
Item names, short summaries and the single action row establish the hierarchy.
