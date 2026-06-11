// ============================================================
// Orbit — Foundational components (Linear-style redirect)
// Compact app bars, plain section labels, dense rows.
// ============================================================

// ─── Lucide icon helper ──────────────────────────────────────
function Icon({ name, size = 18, color = "currentColor", strokeWidth = 1.5, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide?.createIcons && ref.current) {
      window.lucide.createIcons({
        attrs: { width: size, height: size, "stroke-width": strokeWidth, stroke: color },
        nameAttr: "data-lucide", icons: window.lucide.icons,
      });
    }
  });
  return (
    <i ref={ref} data-lucide={name}
      style={{ display: "inline-flex", width: size, height: size, color, flexShrink: 0, ...style }} />
  );
}

// ─── Phone shell ─────────────────────────────────────────────
function OrbitPhone({ width = 412, height = 892, dark = true, scheme = "purple", time = "9:30", children }) {
  const cls = `scheme-${scheme} ${dark ? "dark" : "light"}`;
  return (
    <div className={cls} style={{
      width, height, borderRadius: 36, padding: 8,
      background: dark ? "#0c0c10" : "#dbd9e0",
      boxShadow: dark
        ? "0 18px 50px rgba(0,0,0,0.40), 0 6px 18px rgba(0,0,0,0.20)"
        : "0 18px 50px rgba(15,16,22,0.16), 0 6px 18px rgba(15,16,22,0.06)",
      boxSizing: "border-box", flexShrink: 0,
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 28, overflow: "hidden",
        background: "var(--bg)", color: "var(--fg-1)",
        display: "flex", flexDirection: "column", position: "relative",
      }}>
        <OrbitStatusBar time={time} />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
        <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 108, height: 4, borderRadius: 2, background: "var(--fg-1)", opacity: 0.35 }} />
        </div>
      </div>
    </div>
  );
}

function OrbitStatusBar({ time }) {
  return (
    <div style={{
      height: 36, padding: "0 22px",
      display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500,
        fontVariantNumeric: "tabular-nums", color: "var(--fg-1)",
      }}>{time}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-1)" }}>
        <Icon name="signal" size={13} />
        <Icon name="wifi" size={13} />
        <Icon name="battery-medium" size={15} />
      </div>
    </div>
  );
}

// ─── AppBar (replaces EditionMasthead everywhere) ────────────
// Compact 52px row: leading icon · title (+ optional subtitle) · right cluster
function AppBar({
  back = false, backLabel,
  leadingIcon, title, subtitle,
  trailing,
  hairline = true,
}) {
  return (
    <div style={{
      minHeight: 52, padding: "0 12px 0 8px",
      display: "flex", alignItems: "center",
      borderBottom: hairline ? "1px solid var(--hairline)" : "none",
      flexShrink: 0, gap: 4,
    }}>
      <button aria-label="Back" style={iconBtn}>
        {back
          ? <Icon name="chevron-left" size={18} strokeWidth={1.7} color="var(--fg-2)" />
          : leadingIcon
            ? <Icon name={leadingIcon} size={17} strokeWidth={1.5} color="var(--fg-2)" />
            : <span style={{ width: 18, height: 18 }} />}
      </button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, gap: 1 }}>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600,
          color: "var(--fg-1)", letterSpacing: "-0.01em", lineHeight: 1.2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
            color: "var(--fg-3)", letterSpacing: "0.04em",
            fontVariantNumeric: "tabular-nums",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{subtitle}</div>
        )}
      </div>
      {trailing && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {trailing}
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  appearance: "none", border: 0, background: "transparent", cursor: "pointer",
  width: 36, height: 36, borderRadius: 8,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: 0, color: "var(--fg-2)",
};

// ─── Section label — plain, flush-left ───────────────────────
function SectionLabel({ children, top = 24, bottom = 12, trailing }) {
  return (
    <div style={{
      padding: `${top}px 20px ${bottom}px`,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
        color: "var(--fg-3)",
      }}>{children}</span>
      {trailing}
    </div>
  );
}

// ─── Info row — stat strip below app bar (Today, etc.) ───────
function InfoRow({ label, mono, progress }) {
  return (
    <div style={{
      padding: "12px 20px",
      display: "flex", alignItems: "center", gap: 16,
      borderBottom: "1px solid var(--hairline)",
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500,
        color: "var(--fg-2)", fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}>{label || mono}</span>
      {progress != null && (
        <div style={{ flex: 1, height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${Math.round(progress * 100)}%`,
            background: "var(--primary)", borderRadius: 999,
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Section-head tabs (Today / All / General / Goals) ──────
function SectionHeadTabs({ active = "today", onChange, isPro = false }) {
  const tabs = [
    { id: "today", label: "Today" },
    { id: "all", label: "All" },
    { id: "general", label: "General" },
    { id: "goals", label: "Goals" },
  ];
  return (
    <div style={{
      padding: "8px 20px 10px",
      borderBottom: "1px solid var(--hairline)",
      display: "flex", alignItems: "center", gap: 6,
      flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const showLock = t.id === "goals" && !isPro;
        return (
          <button key={t.id} onClick={() => onChange && onChange(t.id)} style={{
            appearance: "none", border: 0, cursor: "pointer",
            background: isActive ? "var(--bg-elev)" : "transparent",
            boxShadow: isActive ? "inset 0 0 0 1px var(--hairline-strong)" : "none",
            color: isActive ? "var(--fg-1)" : "var(--fg-3)",
            fontFamily: "var(--font-sans)", fontSize: 13,
            fontWeight: isActive ? 600 : 500,
            padding: "5px 10px", borderRadius: 6,
            display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            {t.label}
            {showLock && <Icon name="lock" size={11} strokeWidth={1.6} color="currentColor" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Utility row (search · chips · ... menu) ────────────────
function UtilityRow({
  searchOpen = false, searchValue = "", onSearchToggle, onSearchChange, onSearchClear,
  activeFreq = "all", onFreq, showFreq = true,
  tags = [], activeTagIds = [], onToggleTag, onMore,
}) {
  const freqs = [
    { id: "all", label: "All" },
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "yearly", label: "Yearly" },
    { id: "onetime", label: "One-time" },
  ];
  return (
    <div style={{
      borderBottom: "1px solid var(--hairline)", flexShrink: 0,
      padding: "10px 8px 10px 12px",
      display: "flex", alignItems: "center", gap: 0,
    }}>
      {searchOpen ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, paddingLeft: 8 }}>
          <Icon name="search" size={15} strokeWidth={1.6} color="var(--fg-3)" />
          <input value={searchValue}
            onChange={e => onSearchChange && onSearchChange(e.target.value)}
            placeholder="Search habits" autoFocus
            style={{
              flex: 1, minWidth: 0,
              appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)",
            }} />
          {searchValue && (
            <button onClick={onSearchClear} style={iconBtn}>
              <Icon name="x" size={14} strokeWidth={1.6} color="var(--fg-3)" />
            </button>
          )}
          <button onClick={onSearchToggle} style={{
            appearance: "none", border: 0, background: "transparent", cursor: "pointer",
            padding: "6px 8px", color: "var(--fg-2)",
            fontFamily: "var(--font-sans)", fontSize: 13,
          }}>Cancel</button>
        </div>
      ) : (
        <>
          <button onClick={onSearchToggle} aria-label="Search" style={iconBtn}>
            <Icon name="search" size={15} strokeWidth={1.6} color="var(--fg-3)" />
          </button>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            overflowX: "auto", scrollbarWidth: "none",
            flex: 1, minWidth: 0,
          }}>
            {showFreq && freqs.map(f => (
              <Chip key={f.id} active={f.id === activeFreq} onClick={() => onFreq && onFreq(f.id)}>
                {f.label}
              </Chip>
            ))}
            {showFreq && tags.length > 0 && (
              <div style={{ width: 1, height: 16, background: "var(--hairline-strong)", flexShrink: 0, margin: "0 2px" }} />
            )}
            {tags.map(t => (
              <TagChip key={t.id} tag={t} active={activeTagIds.includes(t.id)}
                onClick={() => onToggleTag && onToggleTag(t.id)} />
            ))}
          </div>
          <button onClick={onMore} aria-label="More" style={iconBtn}>
            <Icon name="more-horizontal" size={18} strokeWidth={1.6} color="var(--fg-3)" />
          </button>
        </>
      )}
    </div>
  );
}

// ─── Linear-style hairline-ringed chips ─────────────────────
function Chip({ children, active, onClick, leading }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, cursor: "pointer",
      height: 26, padding: "0 9px", borderRadius: 6,
      background: active ? "var(--bg-elev)" : "transparent",
      boxShadow: active ? "inset 0 0 0 1px var(--fg-3)" : "inset 0 0 0 1px var(--hairline-strong)",
      color: active ? "var(--fg-1)" : "var(--fg-2)",
      fontFamily: "var(--font-sans)", fontSize: 12,
      fontWeight: active ? 600 : 500,
      whiteSpace: "nowrap", flexShrink: 0,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {leading}
      {children}
    </button>
  );
}

function TagChip({ tag, active, onClick }) {
  return (
    <Chip active={active} onClick={onClick}
      leading={<span style={{
        width: 6, height: 6, borderRadius: 999, background: tag.color, flexShrink: 0,
      }} />}
    >{tag.name}</Chip>
  );
}

// ─── Status dot — single 8px dot, color from --status-* ─────
function StatusDot({ state = "empty", size = 8, onToggle }) {
  const colorMap = {
    done: "var(--status-done)",
    empty: "transparent",
    skip: "var(--status-skip)",
    overdue: "var(--status-overdue)",
    bad: "var(--status-bad)",
    frozen: "var(--status-frozen)",
  };
  const isHollow = state === "empty";
  return (
    <button onClick={e => { e.stopPropagation(); onToggle && onToggle(); }} aria-label={state} style={{
      appearance: "none", border: 0, background: "transparent", cursor: "pointer",
      padding: 6, margin: -6, flexShrink: 0,
    }}>
      <span style={{
        width: size, height: size, borderRadius: 999,
        background: colorMap[state],
        boxShadow: isHollow ? "inset 0 0 0 1.5px var(--status-empty)" : "none",
        display: "inline-block",
      }} />
    </button>
  );
}

// ─── Parent progress ring (small, no inner text) ─────────────
function ParentRing({ done, total, size = 12 }) {
  const pct = total ? done / total : 0;
  const r = (size - 1.5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span style={{
      width: size, height: size, position: "relative", display: "inline-block", flexShrink: 0,
    }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--status-empty)" strokeWidth="1.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth="1.5"
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" />
      </svg>
    </span>
  );
}

// ─── Select-mode checkbox ───────────────────────────────────
function SelectCheck({ selected, size = 18, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick && onClick(); }} style={{
      appearance: "none", border: 0, background: "transparent", cursor: "pointer",
      padding: 0, flexShrink: 0, width: 20, height: 20,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {selected ? (
        <div style={{
          width: size, height: size, borderRadius: 4, background: "var(--primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none"
            stroke="var(--fg-on-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 4,
          boxShadow: "inset 0 0 0 1.5px var(--hairline-strong)",
        }} />
      )}
    </button>
  );
}

// ─── HABIT ROW — Linear-tight, single line ──────────────────
function HabitRow({
  habit, child = false, indent = 0,
  selectMode = false, selected = false,
  expanded = false, onToggleExpand,
  onToggleState, onSelect, onOpen,
}) {
  const isDone = habit.state === "done";
  const isSkip = habit.state === "skip";
  const titleSize = child ? 14 : 17;
  const emojiSize = child ? 16 : 18;

  // Compose meta inline
  const metaParts = [];
  if (habit.frequency) metaParts.push(habit.frequency);
  if (habit.dueTime) metaParts.push(habit.dueTime);
  if (habit.checklist) metaParts.push(`${habit.checklist.done}/${habit.checklist.total}`);
  if (habit.overdue && !child) metaParts.push({ kind: "overdue" });
  if (habit.bad && !child) metaParts.push({ kind: "bad" });

  const showStreak = habit.streak >= 2 && !child;
  const dotState = habit.overdue ? "overdue" : habit.bad ? "bad" : habit.frozen ? "frozen" : habit.state;

  return (
    <div onClick={() => selectMode ? onSelect && onSelect() : onOpen && onOpen()}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: `${child ? 10 : 13}px 20px ${child ? 10 : 13}px ${20 + indent}px`,
        borderBottom: "1px solid var(--hairline)",
        cursor: "pointer",
        background: selected ? "var(--bg-sunk)" : "transparent",
        position: "relative",
      }}>
      {indent > 0 && (
        <>
          {/* Vertical tree line — full height except last child stops at midpoint */}
          <span aria-hidden style={{
            position: "absolute", left: indent / 2 + 12, top: 0,
            bottom: habit._lastChild ? "50%" : 0,
            width: 1, background: "var(--hairline-strong)",
          }} />
          {/* Horizontal branch stub at midpoint */}
          <span aria-hidden style={{
            position: "absolute", left: indent / 2 + 12, top: "50%",
            width: 8, height: 1, background: "var(--hairline-strong)",
          }} />
        </>
      )}
      {selectMode && <SelectCheck selected={selected} onClick={onSelect} />}
      {habit.hasChildren && !selectMode && (
        <button onClick={e => { e.stopPropagation(); onToggleExpand && onToggleExpand(); }} style={{
          appearance: "none", border: 0, background: "transparent", cursor: "pointer",
          padding: 0, color: "var(--fg-3)",
          transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform var(--dur-base) var(--ease-standard)",
          flexShrink: 0, display: "flex",
        }}>
          <Icon name="chevron-down" size={14} />
        </button>
      )}
      {habit.emoji && (
        <span style={{ fontSize: emojiSize, lineHeight: 1, flexShrink: 0 }}>{habit.emoji}</span>
      )}

      {/* Title + inline meta */}
      <div style={{
        flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: titleSize,
          fontWeight: 400,
          color: isDone ? "var(--fg-3)" : (isSkip ? "var(--fg-3)" : "var(--fg-1)"),
          textDecoration: isDone ? "line-through" : "none",
          textDecorationColor: "var(--hairline-strong)",
          textDecorationThickness: 1,
          lineHeight: 1.25, letterSpacing: "-0.005em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flexShrink: 1, minWidth: 0,
        }}>{habit.name}</span>
        {metaParts.length > 0 && (
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 13,
            color: "var(--fg-3)", flexShrink: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ margin: "0 4px", color: "var(--fg-4)" }}>·</span>
            {metaParts.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ margin: "0 6px", color: "var(--fg-4)" }}>·</span>}
                {typeof p === "string" ? p
                  : p.kind === "overdue"
                    ? <span style={{ color: "var(--status-overdue)" }}>Overdue</span>
                    : p.kind === "bad"
                      ? <span style={{ color: "var(--status-bad)" }}>Bad</span>
                      : null}
              </React.Fragment>
            ))}
          </span>
        )}
      </div>

      {/* trailing cluster: linked-goal dot · status dot · streak number */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {habit.linkedGoal && (
          <span aria-label="Linked goal" style={{
            width: 5, height: 5, borderRadius: 999, background: "var(--primary)",
          }} />
        )}
        {!selectMode && (
          habit.hasChildren && habit.childProgress
            ? <ParentRing done={habit.childProgress.done} total={habit.childProgress.total} size={14} />
            : <StatusDot state={dotState} size={9} onToggle={onToggleState} />
        )}
        {showStreak && !selectMode && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
            color: "var(--fg-2)", fontVariantNumeric: "tabular-nums",
            minWidth: 18, textAlign: "right",
          }}>{habit.streak}</span>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton row ────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "16px 20px",
      borderBottom: "1px solid var(--hairline)",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ width: "55%", height: 10, borderRadius: 3, background: "var(--bg-sunk)" }} />
        <div style={{ width: "30%", height: 7, borderRadius: 3, background: "var(--bg-sunk)" }} />
      </div>
      <div style={{
        width: 9, height: 9, borderRadius: 999,
        boxShadow: "inset 0 0 0 1.5px var(--hairline-strong)",
        flexShrink: 0,
      }} />
    </div>
  );
}

// ─── Floating bulk action bar ────────────────────────────────
function BulkActionBar({ count = 3, bottomOffset = 80 }) {
  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: bottomOffset,
      borderRadius: 12, padding: "10px 12px 12px",
      background: "var(--bg-elev)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)",
      display: "flex", flexDirection: "column", gap: 10,
      animation: "orbit-bulk-in 240ms var(--ease-standard) both",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--fg-1)",
      }}>
        <span><span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{count}</span> selected</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <BulkBtn icon="check-circle-2" label="Log" />
        <BulkBtn icon="fast-forward" label="Skip" />
        <BulkBtn icon="trash-2" label="Delete" />
        <div style={{ flex: 1 }} />
        <BulkBtn icon="x" label="Close" />
      </div>
    </div>
  );
}

function BulkBtn({ icon, label }) {
  return (
    <button aria-label={label} style={{
      appearance: "none", border: 0, cursor: "pointer",
      background: "transparent", color: "var(--fg-1)",
      width: 36, height: 36, borderRadius: 8,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <Icon name={icon} size={18} strokeWidth={1.6} />
    </button>
  );
}

// ─── Empty state — software-tool tone ───────────────────────
function EmptyState({ title = "Nothing scheduled.", action, onAction, astraPill = false }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 16, padding: "60px 24px",
    }}>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 17, color: "var(--fg-2)",
        fontStyle: "italic", textAlign: "center",
      }}>{title}</div>
      {astraPill && (
        <button onClick={onAction} style={{
          appearance: "none", border: 0, cursor: "pointer",
          background: "var(--primary)", color: "var(--fg-on-primary)",
          padding: "8px 14px", borderRadius: 999,
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="sparkles" size={14} strokeWidth={1.6} color="var(--fg-on-primary)" />
          {action || "Tell Astra"}
        </button>
      )}
      {!astraPill && action && (
        <button onClick={onAction} style={{
          appearance: "none", border: 0, background: "transparent", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
          color: "var(--fg-1)", padding: 0,
          textDecoration: "underline", textUnderlineOffset: 4, textDecorationThickness: 1,
          textDecorationColor: "var(--hairline-strong)",
        }}>{action}</button>
      )}
    </div>
  );
}

Object.assign(window, {
  Icon, OrbitPhone, OrbitStatusBar, AppBar, SectionLabel, InfoRow,
  SectionHeadTabs, UtilityRow, Chip, TagChip, StatusDot, ParentRing,
  SelectCheck, HabitRow, SkeletonRow, BulkActionBar, EmptyState,
  iconBtn,
});
