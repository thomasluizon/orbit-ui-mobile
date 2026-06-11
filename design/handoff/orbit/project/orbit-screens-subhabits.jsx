// ============================================================
// Orbit — Sub-habit prominence additions
// - Active Pro sub-habits in Create flow
// - Habit-row action sheet
// - 2-frame drill sequence
// - Nested sub-habits (3 levels)
// ============================================================

// ─── Create Habit · Pro active sub-habits ───────────────────
function CreateHabitSubHabitsActive({ scheme = "purple", dark = true }) {
  const items = ["Make the bed", "Drink water", "Stretch · 10 min", "Read · 20 min"];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <SheetBg />
      <BottomSheet heightPct={92}>
        <div style={{ padding: "4px 20px 0", flex: 1, overflowY: "auto" }}>
          <div style={{
            display: "flex", justifyContent: "center", padding: "4px 0 10px",
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
          }}>New habit</div>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            borderBottom: "1px solid var(--hairline-strong)",
            paddingBottom: 8, marginBottom: 14,
          }}>
            <span style={{
              width: 32, height: 32, borderRadius: 999,
              boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>🌅</span>
            <input defaultValue="Morning routine" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>

          <SectionLabel top={4} bottom={8}>Frequency</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["One-time","Recurring","Flexible","General"].map(t => (
              <Chip key={t} active={t === "Recurring"}>{t}</Chip>
            ))}
          </div>

          <div style={{
            padding: "20px 0 6px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--fg-3)" }}>Sub-habits</span>
              <ProTag>Pro</ProTag>
            </span>
          </div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic",
            color: "var(--fg-3)", lineHeight: 1.5, marginBottom: 10,
          }}>Sub-habits are created together with the parent.</div>

          {items.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 0", borderBottom: "1px solid var(--hairline)",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-4)",
                width: 16, textAlign: "right",
              }}>{i + 1}</span>
              <input defaultValue={s} style={{
                flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
                fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)",
              }} />
              <Icon name="x" size={14} strokeWidth={1.7} color="var(--fg-4)" />
            </div>
          ))}
          <div style={{ padding: "12px 0 8px" }}>
            <QuietLink color="var(--fg-1)">+ Add sub-habit</QuietLink>
          </div>
          <div style={{ height: 60 }} />
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>Create habit + 4 sub-habits</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Habit-row action sheet ─────────────────────────────────
function HabitRowActionSheet({ scheme = "purple", dark = true }) {
  const rows = [
    ["pencil", "Edit", false, false],
    ["fast-forward", "Skip today", false, false],
    ["copy", "Duplicate", false, false],
    ["plus", "Add sub-habit", true, false],
    ["arrow-left-right", "Move parent", false, false],
    ["trash-2", "Delete", false, true],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.42, pointerEvents: "none" }}>
        <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21"
          trailing={<UtilityCluster dark streak={47} />} />
        <SectionLabel>Habits</SectionLabel>
      </div>
      <BottomSheet heightPct={48}>
        <div style={{ padding: "4px 20px 0", flex: 1, overflowY: "auto" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 0 10px",
          }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", fontStyle: "italic" }}>Languages</span>
          </div>
          {rows.map(([icon, label, isPro, destructive]) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "13px 0", borderBottom: "1px solid var(--hairline)",
            }}>
              <Icon name={icon} size={17} strokeWidth={1.5}
                color={destructive ? "var(--fg-3)" : "var(--fg-2)"} />
              <span style={{
                flex: 1,
                fontFamily: "var(--font-sans)", fontSize: 15,
                color: destructive ? "var(--fg-3)" : "var(--fg-1)",
                fontStyle: destructive ? "italic" : "normal",
              }}>{label}</span>
              {isPro && <ProTag>Pro</ProTag>}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 10px" }}>
            <QuietLink>Cancel</QuietLink>
          </div>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Drill 2-frame sequence ─────────────────────────────────
function DrillList({ scheme = "purple", dark = true }) {
  const rows = [
    { id: "k1", emoji: "💧", name: "Drink water", frequency: "Daily", streak: 23, state: "done" },
    { id: "kp", emoji: "🌐", name: "Languages", frequency: "Daily", hasChildren: true, childProgress: { done: 1, total: 2 }, state: "empty" },
    { id: "kp1", _child: true, _focused: true, name: "Spanish", frequency: "Daily", streak: 41, state: "done" },
    { id: "kp2", _child: true, _lastChild: true, name: "French", frequency: "Daily", streak: 12, state: "empty" },
    { id: "k5", name: "Weekly review", frequency: "Weekly", streak: 6, state: "skip" },
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="sun" title="All habits"
        trailing={<UtilityCluster dark streak={47} />} />
      <SectionHeadTabs active="all" />
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={[]} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", position: "relative" }}>
        {rows.map(h => (
          <div key={h.id} style={{
            position: "relative",
            background: h._focused ? "var(--bg-elev)" : "transparent",
          }}>
            <HabitRow habit={h} child={h._child} indent={h._child ? 16 : 0}
              expanded={h.hasChildren} />
            {h._focused && (
              <span aria-hidden style={{
                position: "absolute", right: 90, top: "50%", transform: "translateY(-50%)",
                width: 14, height: 14, borderRadius: 999,
                boxShadow: "0 0 0 1.5px var(--primary), 0 0 0 6px rgba(124,58,237,0.15)",
                pointerEvents: "none",
              }} />
            )}
          </div>
        ))}
      </div>
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

function DrillChild({ scheme = "purple", dark = true }) {
  const done28 = Array(41).fill(true).slice(0, 28).map((_, i) => i % 8 !== 0);
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Spanish"
        trailing={<QuietLink color="var(--fg-1)" style={{ marginRight: 6 }}>Edit</QuietLink>} />
      <div style={{
        padding: "10px 20px",
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
        color: "var(--fg-3)", letterSpacing: "0.04em",
        borderBottom: "1px solid var(--hairline)",
        fontVariantNumeric: "tabular-nums",
      }}>Parent · <span style={{ color: "var(--fg-1)" }}>Languages</span> · Streak 41 · Longest 67</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Last 28 days</SectionLabel>
        <Last28Grid done={done28} />
        <SectionLabel>Stats</SectionLabel>
        <StatTriple items={[["Streak", "41"], ["Longest", "67"], ["Monthly", "91%"]]} />
        <SectionLabel>Recent logs</SectionLabel>
        {[["Wed May 20", "08:12"], ["Tue May 19", "08:04"], ["Mon May 18", "08:21"]].map(([d, t]) => (
          <div key={d} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 20px", borderBottom: "1px solid var(--hairline)",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>{d}</span>
            <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{t}</span>
          </div>
        ))}
      </div>
      <div style={{
        borderTop: "1px solid var(--hairline)",
        padding: "12px 20px",
        background: "var(--bg)",
      }}>
        <div style={{ position: "relative", paddingLeft: 14 }}>
          <span style={{
            position: "absolute", left: 0, top: 4, bottom: 4,
            width: 2, background: "var(--primary)", borderRadius: 1,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="sparkles" size={12} strokeWidth={1.7} color="var(--primary)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500, color: "var(--fg-3)", letterSpacing: "0.06em" }}>ASK ASTRA</span>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.45 }}>
            Want a vocab routine to anchor your Spanish slot?
          </div>
        </div>
      </div>
    </OrbitPhone>
  );
}

// ─── Nested sub-habits (3 levels) ───────────────────────────
function NestedHabits({ scheme = "purple", dark = true }) {
  const rows = [
    { id: "k1", emoji: "💧", name: "Drink water", frequency: "Daily", streak: 23, state: "done" },
    { id: "kp", emoji: "🌐", name: "Languages", frequency: "Daily", hasChildren: true, childProgress: { done: 2, total: 3 }, state: "empty" },
    { id: "kp1", _child: true, _depth: 1, name: "Spanish", frequency: "Daily", hasChildren: true, childProgress: { done: 1, total: 2 }, state: "empty" },
    { id: "kp1a", _child: true, _depth: 2, name: "Vocab drills", frequency: "Daily", streak: 22, state: "done" },
    { id: "kp1b", _child: true, _depth: 2, _lastChild: true, name: "Speak aloud · 5 min", frequency: "Daily", streak: 8, state: "empty" },
    { id: "kp2", _child: true, _lastChild: true, _depth: 1, name: "French", frequency: "Daily", streak: 12, state: "done" },
    { id: "k5", name: "Weekly review", frequency: "Weekly", streak: 6, state: "skip" },
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="sun" title="All habits"
        trailing={<UtilityCluster dark streak={47} />} />
      <SectionHeadTabs active="all" />
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={[]} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {rows.map(h => (
          <HabitRow key={h.id} habit={h}
            child={h._child}
            indent={h._depth ? h._depth * 16 : (h._child ? 16 : 0)}
            expanded={h.hasChildren}
          />
        ))}
      </div>
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

Object.assign(window, {
  CreateHabitSubHabitsActive, HabitRowActionSheet,
  DrillList, DrillChild, NestedHabits,
});
