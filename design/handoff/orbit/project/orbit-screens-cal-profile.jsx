// ============================================================
// Orbit — Calendar · Profile · Streak Detail · Achievements
// ============================================================

// ─── CALENDAR ───────────────────────────────────────────────
function makeMonth({ startWeekday = 4, days = 31, today = 21, completed = new Set(), partial = new Set(), selected = null }) {
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null });
  for (let d = 1; d <= days; d++) {
    let state = "none";
    if (completed.has(d)) state = "full";
    else if (partial.has(d)) state = "partial";
    cells.push({ day: d, state, today: d === today, selected: d === selected });
  }
  while (cells.length < 42) cells.push({ day: null });
  return cells;
}

function CalendarGrid({ cells }) {
  return (
    <div style={{ padding: "16px 20px 8px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 12 }}>
        {["M","T","W","T","F","S","S"].map((d, i) => (
          <div key={i} style={{
            textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
            color: "var(--fg-3)", letterSpacing: "0.04em",
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 6 }}>
        {cells.map((c, i) => <CalendarCell key={i} cell={c} />)}
      </div>
    </div>
  );
}

function CalendarCell({ cell }) {
  if (!cell.day) return <div style={{ height: 40 }} />;
  let dot = <div style={{ width: 5, height: 5 }} />;
  if (cell.state === "full") dot = <div style={{ width: 5, height: 5, borderRadius: 999, background: "var(--fg-1)" }} />;
  else if (cell.state === "partial") dot = <div style={{ width: 5, height: 5, borderRadius: 999, boxShadow: "inset 0 0 0 1px var(--fg-3)" }} />;
  return (
    <div style={{
      height: 40, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 3,
      position: "relative",
      boxShadow: cell.selected ? "inset 0 0 0 1px var(--hairline-strong)" : "none",
      borderRadius: 6,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: cell.today ? 600 : 400,
        color: cell.state === "none" && !cell.today ? "var(--fg-3)" : "var(--fg-1)",
        fontVariantNumeric: "tabular-nums",
      }}>{cell.day}</div>
      {cell.today
        ? <div style={{ width: 5, height: 5, borderRadius: 999, background: "var(--primary)" }} />
        : dot}
    </div>
  );
}

function CalendarShell({ scheme = "purple", dark = true, monthLabel = "May 2026", children, navActive = "calendar" }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="calendar-days" title="Calendar"
        subtitle={monthLabel}
        trailing={
          <>
            <button aria-label="Previous month" style={iconBtn}>
              <Icon name="chevron-left" size={17} strokeWidth={1.6} color="var(--fg-2)" />
            </button>
            <button aria-label="Next month" style={iconBtn}>
              <Icon name="chevron-right" size={17} strokeWidth={1.6} color="var(--fg-2)" />
            </button>
          </>
        }
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      <BottomNav active={navActive} />
    </OrbitPhone>
  );
}

function CalendarA({ scheme = "purple", dark = true }) {
  const completed = new Set([1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,18,19,20]);
  const partial = new Set([13, 14]);
  const cells = makeMonth({ startWeekday: 4, days: 31, today: 21, completed, partial });
  return (
    <CalendarShell scheme={scheme} dark={dark}>
      <CalendarGrid cells={cells} />
      <SectionLabel>Legend</SectionLabel>
      <div style={{ padding: "0 20px" }}>
        <LegendRow dot="full" label="Full" desc="All habits done" />
        <LegendRow dot="partial" label="Partial" desc="Some done" />
        <LegendRow dot="empty" label="None" desc="Nothing scheduled" />
      </div>
      <SectionLabel>This month</SectionLabel>
      <StatRow label="Best streak" value="14" />
      <StatRow label="Total logs" value="127" />
      <StatRow label="Missed" value="6" />
      <div style={{ height: 24 }} />
    </CalendarShell>
  );
}

function LegendRow({ dot, label, desc }) {
  const dotEl = dot === "full"
    ? <div style={{ width: 5, height: 5, borderRadius: 999, background: "var(--fg-1)" }} />
    : dot === "partial"
    ? <div style={{ width: 5, height: 5, borderRadius: 999, boxShadow: "inset 0 0 0 1px var(--fg-3)" }} />
    : <div style={{ width: 9, height: 1, background: "var(--fg-3)" }} />;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 0", borderBottom: "1px solid var(--hairline)",
    }}>
      <span style={{ width: 14, display: "inline-flex", justifyContent: "center" }}>{dotEl}</span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)" }}>· {desc}</span>
    </div>
  );
}

function StatRow({ label, value, suffix }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "13px 20px", borderBottom: "1px solid var(--hairline)",
    }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)" }}>{label}</span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 500,
        color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
      }}>{value}{suffix && <span style={{ fontSize: 12, color: "var(--fg-3)", marginLeft: 4 }}>{suffix}</span>}</span>
    </div>
  );
}

function CalendarB({ scheme = "purple", dark = true }) {
  const completed = new Set([2,3,5,7,8,10,11,12,15,16,17,18,19,22,24,25,28,30]);
  const partial = new Set([4, 9, 14, 23]);
  const cells = makeMonth({ startWeekday: 1, days: 30, today: null, completed, partial });
  return (
    <CalendarShell scheme={scheme} dark={dark} monthLabel="April 2026">
      <CalendarGrid cells={cells} />
      <SectionLabel>April · close</SectionLabel>
      <StatRow label="Days complete" value="22" suffix="/ 30" />
      <StatRow label="Best streak" value="11" />
      <StatRow label="Missed" value="8" />
      <div style={{ height: 24 }} />
    </CalendarShell>
  );
}

function CalendarC({ scheme = "purple", dark = true }) {
  const completed = new Set([1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,18,19,20]);
  const partial = new Set([13, 14]);
  const cells = makeMonth({ startWeekday: 4, days: 31, today: 21, completed, partial, selected: 14 });
  const dayHabits = [
    { id: "d1", emoji: "🏃", name: "Morning run", frequency: "Daily", dueTime: "07:00", state: "done", streak: 5 },
    { id: "d2", emoji: "💧", name: "Drink water", frequency: "Daily", state: "done" },
    { id: "d3", emoji: "📖", name: "Read 30 minutes", frequency: "Daily", state: "empty" },
    { id: "d4", emoji: "🧘", name: "Meditate", frequency: "Daily", state: "done", streak: 40 },
  ];
  return (
    <CalendarShell scheme={scheme} dark={dark}>
      <CalendarGrid cells={cells} />
      <SectionLabel>May 14</SectionLabel>
      {dayHabits.map(h => <HabitRow key={h.id} habit={h} />)}
      <div style={{ height: 24 }} />
    </CalendarShell>
  );
}

function CalendarD({ scheme = "purple", dark = true }) {
  const cells = makeMonth({ startWeekday: 0, days: 30, today: null });
  return (
    <CalendarShell scheme={scheme} dark={dark} monthLabel="June 2026">
      <CalendarGrid cells={cells} />
      <SectionLabel>Awaiting</SectionLabel>
      <div style={{
        padding: "16px 20px", fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.55,
        color: "var(--fg-3)", fontStyle: "italic",
      }}>Six habits are scheduled to recur this month.</div>
    </CalendarShell>
  );
}

// ─── PROFILE ────────────────────────────────────────────────
function ProfileScreen({ scheme = "purple", dark = true, plan = "free", daysLeft = 4 }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="user" title="You"
        trailing={<UtilityCluster dark={dark} streak={47} />}
      />
      {plan === "trial" && (
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>
            Trial · <span style={{ color: "var(--fg-1)", fontStyle: daysLeft < 3 ? "italic" : "normal" }}>{daysLeft < 3 ? "Last day" : `${daysLeft} days left`}</span>
          </span>
          <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
        </EdgeBanner>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* User block */}
        <div style={{
          padding: "20px 20px 18px",
          display: "flex", alignItems: "center", gap: 14,
          borderBottom: "1px solid var(--hairline)",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 999,
            background: "var(--bg-elev)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 600,
            color: "var(--fg-1)",
          }}>SR</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "var(--fg-1)" }}>Sam Rivers</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)" }}>sam@orbit.app</span>
          </div>
        </div>

        {/* Streak row */}
        <div onClick={() => {}} style={{
          padding: "14px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="14" height="16" viewBox="0 0 24 24" fill="none"
              stroke="var(--status-bad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Streak</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600,
              color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
            }}>47</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)" }}>days</span>
            <Icon name="chevron-right" size={16} strokeWidth={1.5} color="var(--fg-4)" />
          </div>
        </div>

        <SectionLabel>Account</SectionLabel>
        <SettingsRow label="Preferences" onTap={() => {}} />
        <SettingsRow label="AI Settings" onTap={() => {}} />

        <SectionLabel>Features</SectionLabel>
        <SettingsRow label="Retrospective" onTap={() => {}}>
          <ProTag>Pro · Yearly</ProTag>
        </SettingsRow>
        <SettingsRow label="Achievements" onTap={() => {}}>
          {plan === "free" && <ProTag>Pro</ProTag>}
        </SettingsRow>
        <SettingsRow label="Calendar Sync" onTap={() => {}}>
          {plan === "free" && <ProTag>Pro</ProTag>}
        </SettingsRow>
        <SettingsRow label="About" onTap={() => {}} />
        <SettingsRow label="Advanced" onTap={() => {}} />

        <SectionLabel>Subscription</SectionLabel>
        {plan === "free" && (
          <SettingsRow label="Plan" value="Free" onTap={() => {}}>
            <ProTag>Pro</ProTag>
          </SettingsRow>
        )}
        {plan === "trial" && (
          <SettingsRow label="Plan" value={`Trial · ${daysLeft} days`} accessory="none">
            <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
          </SettingsRow>
        )}
        {plan === "pro" && (
          <SettingsRow label="Plan" value="Pro · Annual" accessory="none">
            <QuietLink color="var(--fg-1)">Manage</QuietLink>
          </SettingsRow>
        )}

        <SectionLabel>Account actions</SectionLabel>
        <SettingsRow label="Sign out" onTap={() => {}} accessory="none" />
        <SettingsRow label="Fresh start" onTap={() => {}} accessory="none" />
        <SettingsRow label="Delete account" onTap={() => {}} accessory="none" />
        <div style={{ height: 24 }} />
      </div>
      <BottomNav active="profile" />
    </OrbitPhone>
  );
}

function ProfileA({ scheme = "purple", dark = true }) { return <ProfileScreen scheme={scheme} dark={dark} plan="free" />; }
function ProfileB() { return <ProfileScreen scheme="blue" dark plan="pro" />; }
function ProfileC({ scheme = "purple", dark = true }) { return <ProfileScreen scheme={scheme} dark={dark} plan="trial" daysLeft={4} />; }
function ProfileRetint({ scheme }) { return <ProfileScreen scheme={scheme} dark={true} plan="free" />; }

// ─── STREAK DETAIL ──────────────────────────────────────────
function StreakDetail({ scheme = "purple", dark = true }) {
  const weekDays = [
    { date: "M 19", state: "active" }, { date: "T 20", state: "active" },
    { date: "W 21", state: "today" }, { date: "T 22", state: "future" },
    { date: "F 23", state: "future" }, { date: "S 24", state: "future" },
    { date: "S 25", state: "future" },
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Streak" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* Hero */}
        <div style={{
          padding: "32px 20px 28px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          borderBottom: "1px solid var(--hairline)",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
            color: "var(--fg-3)", letterSpacing: "0.06em",
          }}>Current streak</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 80, fontWeight: 500,
            letterSpacing: "-0.04em", lineHeight: 0.9, color: "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
          }}>47</span>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--fg-3)",
          }}>Forty-seven days. The longest run yet.</span>
        </div>

        <SectionLabel>This week</SectionLabel>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0 20px 14px", gap: 6,
        }}>
          {weekDays.map((d, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "6px 0",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                color: d.state === "today" ? "var(--fg-1)" : "var(--fg-3)",
              }}>{d.date}</span>
              {d.state === "active" && <div style={{ width: 7, height: 7, borderRadius: 999, background: "var(--fg-1)" }} />}
              {d.state === "today" && <div style={{ width: 7, height: 7, borderRadius: 999, background: "var(--primary)" }} />}
              {d.state === "future" && <div style={{ width: 7, height: 7 }} />}
            </div>
          ))}
        </div>

        <SectionLabel>Freeze</SectionLabel>
        <SettingsRow label="Available" accessory="none">
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg-1)", fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}>1</span>
          <QuietLink color="var(--fg-1)" style={{ marginLeft: 12 }}>Use</QuietLink>
        </SettingsRow>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>Earned next</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)",
              fontVariantNumeric: "tabular-nums",
            }}>in 4 days</span>
          </div>
          <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "43%", background: "var(--fg-1)", borderRadius: 999 }} />
          </div>
        </div>
        <SettingsRow label="This month" value="0 / 3 used" accessory="none" mono />
        <div style={{
          display: "flex", justifyContent: "center", gap: 18, padding: "18px 20px",
        }}>
          {[true, true, false, false, false].map((earned, i) => (
            <svg key={i} width="18" height="20" viewBox="0 0 24 24" fill={earned ? "var(--fg-1)" : "none"}
              stroke={earned ? "var(--fg-1)" : "var(--fg-4)"} strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2 L21 6 V12 C21 17 12 22 12 22 C12 22 3 17 3 12 V6 Z" />
            </svg>
          ))}
        </div>

        <SectionLabel>Tier</SectionLabel>
        <div style={{ padding: "10px 20px 18px", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)", marginBottom: 4,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--primary)" }} />
            Strong
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", fontStyle: "italic" }}>
            Steady through several weeks. Keep it up.
          </div>
        </div>

        <SectionLabel>Milestones</SectionLabel>
        {[
          ["07 days", "Mar 11", "First week", true],
          ["14 days", "Mar 18", "Two weeks", true],
          ["30 days", "Apr 03", "One month", true],
          ["47 days", "May 20", "Current", true, true],
          ["60 days", "Ahead", "Sixty", false],
          ["90 days", "Ahead", "Ninety", false],
        ].map(([days, date, label, achieved, current], i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
            opacity: achieved ? 1 : 0.6,
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
              color: achieved ? "var(--fg-2)" : "var(--fg-4)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {days}<span style={{ margin: "0 8px", color: "var(--fg-4)" }}>·</span>{date}
            </span>
            <span style={{
              fontFamily: "var(--font-sans)", fontSize: 14,
              color: current ? "var(--fg-1)" : (achieved ? "var(--fg-3)" : "var(--fg-4)"),
              fontWeight: current ? 600 : 400, fontStyle: achieved ? "normal" : "italic",
            }}>{label}</span>
          </div>
        ))}

        <SectionLabel>History</SectionLabel>
        {[
          ["Mar 1", "Mar 18", 17],
          ["Feb 7", "Feb 12", 5],
          ["Jan 14", "Jan 22", 8],
        ].map(([s, e, d], i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>{s} → {e}</span>
            <span style={{ color: "var(--fg-1)" }}>{d} days</span>
            <span style={{ color: "var(--fg-4)", fontStyle: "italic" }}>broken</span>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

// ─── ACHIEVEMENTS ───────────────────────────────────────────
function AchievementsScreen({ scheme = "purple", dark = true }) {
  const sections = [
    ["Getting started", [
      ["First habit", "Created your first habit", "common", 10, "Mar 1"],
      ["First log", "Logged your first day", "common", 10, "Mar 1"],
      ["First week", "Logged seven days in a row", "uncommon", 25, "Mar 8"],
    ]],
    ["Consistency", [
      ["Steady hand", "Forty-seven-day streak", "rare", 50, "May 20", "current"],
      ["Century", "One hundred days in a row", "epic", 100, null],
      ["A full year", "Three hundred and sixty-five days", "legendary", 500, null],
    ]],
    ["Volume", [
      ["Four hundred", "Four hundred logs total", "rare", 50, "Apr 30"],
      ["A thousand", "One thousand logs total", "epic", 100, null],
    ]],
    ["Goals", [
      ["First goal", "Created your first goal", "common", 10, null],
      ["Goal achieved", "Completed a standard goal", "uncommon", 25, null],
    ]],
    ["Perfection", [
      ["Clean week", "All scheduled habits logged for seven days", "rare", 50, null],
      ["Clean month", "All scheduled habits logged for a month", "epic", 100, null],
    ]],
    ["Special", [
      ["Night owl", "Logged after midnight three nights running", "uncommon", 25, "Apr 12"],
      ["Quiet", "Reached fifty days without notifications", "rare", 50, null],
    ]],
  ];
  const rarityGlyph = { common: "◇", uncommon: "◈", rare: "◆", epic: "★", legendary: "✦" };
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Achievements" subtitle="Level 7 · Steady hand" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {/* Level card */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 500,
              letterSpacing: "-0.025em", lineHeight: 1, color: "var(--fg-1)",
              fontVariantNumeric: "tabular-nums",
            }}>07</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Steady hand</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)",
                fontVariantNumeric: "tabular-nums",
              }}>1,840 / 2,400 XP · 560 to next</span>
            </div>
          </div>
          <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "76%", background: "var(--primary)", borderRadius: 999 }} />
          </div>
        </div>

        {sections.map(([label, items]) => (
          <React.Fragment key={label}>
            <SectionLabel>{label}</SectionLabel>
            {items.map(([title, desc, rarity, xp, earned, current]) => (
              <div key={title} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 20px", borderBottom: "1px solid var(--hairline)",
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 16,
                  color: earned ? "var(--fg-1)" : "var(--fg-4)",
                  width: 18, textAlign: "center",
                }}>{rarityGlyph[rarity]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-sans)", fontSize: 15,
                    color: earned ? "var(--fg-1)" : "var(--fg-3)",
                    fontWeight: current ? 600 : 400,
                  }}>{title}</div>
                  {earned && (
                    <div style={{
                      fontFamily: "var(--font-sans)", fontSize: 12, fontStyle: "italic",
                      color: "var(--fg-3)", marginTop: 2,
                    }}>{desc}</div>
                  )}
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                  color: earned ? "var(--fg-3)" : "var(--fg-4)",
                  fontStyle: earned ? "normal" : "italic",
                  fontVariantNumeric: "tabular-nums",
                }}>{earned ? `Earned · ${earned}` : "Locked"}</span>
              </div>
            ))}
          </React.Fragment>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

Object.assign(window, {
  CalendarA, CalendarB, CalendarC, CalendarD, CalendarShell, CalendarGrid, makeMonth,
  ProfileScreen, ProfileA, ProfileB, ProfileC, ProfileRetint, StreakDetail, AchievementsScreen,
  StatRow,
});
