// ============================================================
// Orbit — Today screen (variants a–n)
// Linear-tight rows, AI summary block structural, dark-first.
// ============================================================

const TAGS = {
  health: { id: "health", name: "Health", color: "#6d9a78" },
  mind:   { id: "mind",   name: "Mind",   color: "#7c6d9a" },
  work:   { id: "work",   name: "Work",   color: "#5a7a9a" },
  body:   { id: "body",   name: "Body",   color: "#a08960" },
  read:   { id: "read",   name: "Reading",color: "#9a6d8c" },
};
const TAG_LIST = Object.values(TAGS);

const DEFAULT_HABITS = [
  { id: "h1", emoji: "🏃", name: "Morning run", frequency: "Daily", dueTime: "07:00", streak: 12, tags: [TAGS.body], state: "done" },
  { id: "h2", emoji: "💧", name: "Drink water", frequency: "Daily", checklist: { done: 6, total: 8 }, streak: 23, tags: [TAGS.health], state: "done" },
  { id: "h3", emoji: "📖", name: "Read 30 minutes", frequency: "Daily", dueTime: "21:00", streak: 8, tags: [TAGS.read], state: "empty", overdue: true },
  { id: "h4", emoji: "🧘", name: "Meditate", frequency: "Daily", dueTime: "09:00", streak: 47, tags: [TAGS.mind], state: "empty" },
  { id: "h5", name: "Weekly review", frequency: "Weekly", streak: 6, tags: [TAGS.work], state: "skip" },
  { id: "h6", name: "Stretching", frequency: "Daily", dueTime: "22:30", streak: 3, tags: [TAGS.body], state: "empty" },
];

// ─── AI Summary block (structural, no card) ─────────────────
function AISummaryBlock({ pro = true, hour = "9:24" }) {
  return (
    <div style={{ padding: "14px 20px 16px", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4,
          width: 2, background: "var(--primary)", borderRadius: 1,
        }} />
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
          letterSpacing: "0.06em", color: "var(--fg-3)",
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6,
        }}>
          <Icon name="sparkles" size={11} strokeWidth={1.7} color="var(--primary)" />
          ASTRA · {hour}
        </div>
        {pro ? (
          <>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.5,
              color: "var(--fg-2)", fontStyle: "italic",
            }}>You're two of six done. Reading slipped past nine again — third Thursday in a row. Meditation and stretching are still on the board.</div>
            <div style={{ marginTop: 10 }}>
              <QuietLink color="var(--fg-1)">Ask Astra</QuietLink>
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.5,
              color: "var(--fg-2)", fontStyle: "italic",
            }}>Pro gets a daily summary about your habits.</div>
            <div style={{ marginTop: 10 }}>
              <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── End-of-day reflect prompt ──────────────────────────────
function ReflectPromptBlock() {
  return (
    <div style={{ padding: "14px 20px 16px", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4,
          width: 2, background: "var(--primary)", borderRadius: 1,
        }} />
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
          letterSpacing: "0.06em", color: "var(--fg-3)",
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6,
        }}>
          <Icon name="sparkles" size={11} strokeWidth={1.7} color="var(--primary)" />
          ASTRA · 21:14
        </div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.5,
          color: "var(--fg-2)", fontStyle: "italic", marginBottom: 12,
        }}>The day is closed. Want to reflect on what carried and what didn't?</div>
        <PrimaryButton leading={<Icon name="sparkles" size={13} color="var(--fg-on-primary)" />}>
          Open chat
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── Today shell ────────────────────────────────────────────
function TodayShell({
  scheme = "purple", dark = true,
  dateLong = "Thu · May 21", streak = 47,
  activeTab = "today", isPro = false,
  topBanners = null, withAISummary = false, summaryPro = true,
  withReflectPrompt = false,
  withStatStrip = false, statDone = 2, statTotal = 6,
  children, navActive = "today",
}) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      {topBanners}
      <AppBar
        leadingIcon="sun"
        title="Today"
        subtitle={dateLong}
        trailing={<UtilityCluster dark={dark} unread streak={streak} />}
      />
      {withAISummary && <AISummaryBlock pro={summaryPro} />}
      {withReflectPrompt && <ReflectPromptBlock />}
      {withStatStrip && (
        <InfoRow label={`${statDone} of ${statTotal} · ${Math.round(statDone/statTotal*100)}%`}
          progress={statDone / statTotal} />
      )}
      <SectionHeadTabs active={activeTab} isPro={isPro} />
      {children}
      <BottomNav active={navActive} astraUnread />
    </OrbitPhone>
  );
}

// ─── (a) Default Today ──────────────────────────────────────
function TodayA({ scheme = "purple", dark = true, withBanners = false }) {
  const baseHabits = React.useMemo(() => ([
    { id: "h1", emoji: "🏃", name: "Morning run", frequency: "Daily", dueTime: "07:00", streak: 12, tags: [TAGS.body], state: "done" },
    { id: "h2", emoji: "💧", name: "Drink water", frequency: "Daily", checklist: { done: 6, total: 8 }, streak: 23, tags: [TAGS.health], state: "done" },
    { id: "hp", emoji: "🌐", name: "Languages", frequency: "Daily", hasChildren: true, childProgress: { done: 1, total: 2 }, state: "empty", tags: [TAGS.mind] },
    { id: "hp1", _child: true, _parentId: "hp", name: "Spanish", frequency: "Daily", streak: 41, state: "done" },
    { id: "hp2", _child: true, _parentId: "hp", _lastChild: true, name: "French", frequency: "Daily", streak: 12, state: "empty" },
    { id: "h3", emoji: "📖", name: "Read 30 minutes", frequency: "Daily", dueTime: "21:00", streak: 8, tags: [TAGS.read], state: "empty", overdue: true },
    { id: "h4", emoji: "🧘", name: "Meditate", frequency: "Daily", dueTime: "09:00", streak: 47, tags: [TAGS.mind], state: "empty" },
    { id: "h5", name: "Weekly review", frequency: "Weekly", streak: 6, tags: [TAGS.work], state: "skip" },
  ]), []);
  const [habits, setHabits] = React.useState(baseHabits);
  const [activeFreq, setActiveFreq] = React.useState("all");
  const [activeTagIds, setActiveTagIds] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(new Set(["hp"]));

  const toggleState = id => setHabits(hs => hs.map(h => h.id === id
    ? { ...h, state: h.state === "done" ? "empty" : "done", overdue: false } : h));
  const toggleTag = id => setActiveTagIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  const toggleExpand = id => setExpanded(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  let filtered = habits;
  if (activeFreq !== "all") filtered = filtered.filter(h => h.frequency?.toLowerCase() === activeFreq);
  if (activeTagIds.length) filtered = filtered.filter(h => h.tags?.some(t => activeTagIds.includes(t.id)));
  if (search) filtered = filtered.filter(h => h.name.toLowerCase().includes(search.toLowerCase()));
  // Hide children when parent collapsed
  filtered = filtered.filter(h => !h._child || expanded.has(h._parentId));

  const topLevel = filtered.filter(h => !h._child);
  const done = topLevel.filter(h => h.state === "done").length;
  return (
    <TodayShell scheme={scheme} dark={dark}
      withStatStrip statDone={done} statTotal={topLevel.length}
      topBanners={withBanners && <>
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>
            Trial · <span style={{ color: "var(--fg-1)" }}>4 days left</span>
          </span>
          <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
        </EdgeBanner>
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-1)" }}>Enjoying Orbit? A rating would help.</span>
          <span style={{ display: "flex", gap: 14, flexShrink: 0 }}>
            <QuietLink color="var(--fg-1)">Rate</QuietLink>
            <QuietLink>Later</QuietLink>
          </span>
        </EdgeBanner>
      </>}
    >
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow
        searchOpen={searchOpen} searchValue={search}
        onSearchToggle={() => setSearchOpen(o => !o)}
        onSearchChange={setSearch} onSearchClear={() => setSearch("")}
        activeFreq={activeFreq} onFreq={setActiveFreq}
        tags={TAG_LIST} activeTagIds={activeTagIds} onToggleTag={toggleTag}
      />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {filtered.map(h => (
          <HabitRow key={h.id} habit={h}
            child={h._child} indent={h._child ? 16 : 0}
            expanded={h.hasChildren ? expanded.has(h.id) : false}
            onToggleExpand={h.hasChildren ? () => toggleExpand(h.id) : undefined}
            onToggleState={() => toggleState(h.id)} />
        ))}
      </div>
    </TodayShell>
  );
}

// ─── (b) Loading
function TodayB({ scheme = "purple", dark = true }) {
  return (
    <TodayShell scheme={scheme} dark={dark} withStatStrip statDone={0} statTotal={6}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <SkeletonRow /><SkeletonRow /><SkeletonRow />
      </div>
    </TodayShell>
  );
}

// ─── (c) Empty
function TodayC({ scheme = "purple", dark = true }) {
  return (
    <TodayShell scheme={scheme} dark={dark}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <EmptyState title="Nothing scheduled." action="Tell Astra" astraPill />
    </TodayShell>
  );
}

// ─── (d) Search
function TodayD({ scheme = "purple", dark = true }) {
  const results = DEFAULT_HABITS.filter(h => h.name.toLowerCase().includes("read"));
  return (
    <TodayShell scheme={scheme} dark={dark} withStatStrip statDone={0} statTotal={1}>
      <SectionLabel>1 result</SectionLabel>
      <UtilityRow searchOpen searchValue="read" tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {results.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (e) Select mode + bulk bar
function TodayE({ scheme = "purple", dark = true }) {
  const selectedIds = new Set(["h1", "h3", "h4"]);
  return (
    <TodayShell scheme={scheme} dark={dark}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 160 }}>
        {DEFAULT_HABITS.map(h => (
          <HabitRow key={h.id} habit={h} selectMode selected={selectedIds.has(h.id)} />
        ))}
      </div>
      <BulkActionBar count={3} bottomOffset={88} />
    </TodayShell>
  );
}

// ─── (f) Filtered
function TodayF({ scheme = "purple", dark = true }) {
  const habits = [
    { id: "f1", name: "Weekly review", frequency: "Weekly", streak: 6, tags: [TAGS.work], state: "skip" },
    { id: "f2", name: "Plan the week", frequency: "Weekly", streak: 14, tags: [TAGS.work], state: "done" },
    { id: "f3", name: "Status update", frequency: "Weekly", dueTime: "Fri 16:00", streak: 2, tags: [TAGS.work], state: "empty" },
  ];
  return (
    <TodayShell scheme={scheme} dark={dark} withStatStrip statDone={1} statTotal={3}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow activeFreq="weekly" tags={TAG_LIST} activeTagIds={["work"]} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (g) AI Summary (Pro)
function TodayG({ scheme = "purple", dark = true }) {
  return (
    <TodayShell scheme={scheme} dark={dark} withAISummary summaryPro
      withStatStrip statDone={2} statTotal={6}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {DEFAULT_HABITS.slice(0, 5).map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (g-free) AI Summary upgrade prompt
function TodayGFree({ scheme = "purple", dark = true }) {
  return (
    <TodayShell scheme={scheme} dark={dark} withAISummary summaryPro={false}
      withStatStrip statDone={2} statTotal={6}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {DEFAULT_HABITS.slice(0, 4).map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (g-reflect) End-of-day prompt
function TodayReflect({ scheme = "purple", dark = true }) {
  const habits = DEFAULT_HABITS.map(h => ({ ...h, state: "done", overdue: false }));
  return (
    <TodayShell scheme={scheme} dark={dark} withReflectPrompt
      withStatStrip statDone={6} statTotal={6}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (h) Yesterday
function TodayH({ scheme = "purple", dark = true }) {
  const habits = DEFAULT_HABITS.map(h => h.id === "h3" ? { ...h, overdue: false, state: "done" }
    : h.id === "h4" ? { ...h, state: "done" }
    : h.id === "h6" ? { ...h, state: "done" } : h);
  return (
    <TodayShell scheme={scheme} dark={dark} dateLong="Wed · May 20" streak={46}
      withStatStrip statDone={5} statTotal={6}>
      <SectionLabel>Yesterday</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (i) Tomorrow
function TodayI({ scheme = "purple", dark = true }) {
  const habits = DEFAULT_HABITS.map(h => ({ ...h, overdue: false, state: "empty" }));
  return (
    <TodayShell scheme={scheme} dark={dark} dateLong="Fri · May 22">
      <SectionLabel>Upcoming</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (j) Goals tab (Pro)
function TodayJ({ scheme = "purple", dark = true }) {
  const goals = [
    { id: "g1", name: "Read 12 books", desc: "Standard · books · due Dec 31", value: 4, target: 12, status: "On track" },
    { id: "g2", name: "Run 200 km", desc: "Standard · km · due Jun 30", value: 87, target: 200, status: "At risk" },
    { id: "g3", name: "Meditate 30 days in a row", desc: "Streak · days", value: 12, target: 30, status: "On track" },
  ];
  return (
    <TodayShell scheme={scheme} dark={dark} activeTab="goals" isPro>
      <SectionLabel>Active goals</SectionLabel>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {goals.map(g => (
          <div key={g.id} style={{
            padding: "14px 20px", borderBottom: "1px solid var(--hairline)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}>{g.name}</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-1)", fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}>{g.value}<span style={{ color: "var(--fg-3)" }}>/{g.target}</span></span>
            </div>
            <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${Math.round(g.value/g.target*100)}%`, background: "var(--primary)", borderRadius: 999,
              }} />
            </div>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-3)", marginTop: 8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: g.status === "On track" ? "var(--primary)" : "var(--status-overdue)" }} />
              {g.status} · {g.desc}
            </div>
          </div>
        ))}
      </div>
    </TodayShell>
  );
}

// ─── (k) All tab
function TodayK({ scheme = "purple", dark = true }) {
  const [expanded, setExpanded] = React.useState(true);
  const habits = [
    { id: "k1", name: "Drink water", frequency: "Daily", streak: 23, tags: [TAGS.health], state: "done" },
    { id: "k2", name: "Languages", frequency: "Daily", tags: [TAGS.mind], hasChildren: true, childProgress: { done: 1, total: 2 }, state: "empty" },
    { id: "k3", name: "Spanish", frequency: "Daily", streak: 41, state: "done", _child: true },
    { id: "k4", name: "French", frequency: "Daily", streak: 12, state: "empty", _child: true },
    { id: "k5", name: "Weekly review", frequency: "Weekly", streak: 6, tags: [TAGS.work], state: "skip" },
    { id: "k6", name: "Pay rent", frequency: "Monthly", dueTime: "May 1", streak: 4, state: "done" },
    { id: "k7", name: "Annual physical", frequency: "Yearly", streak: 2, state: "empty" },
    { id: "k8", name: "Renew passport", frequency: "One-time", state: "empty" },
  ];
  return (
    <TodayShell scheme={scheme} dark={dark} activeTab="all" dateLong="All habits" streak={47}>
      <SectionLabel>All habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => {
          if (h._child && !expanded) return null;
          return (
            <HabitRow key={h.id} habit={h}
              child={h._child} indent={h._child ? 16 : 0}
              expanded={h.id === "k2" ? expanded : false}
              onToggleExpand={h.id === "k2" ? () => setExpanded(e => !e) : undefined}
            />
          );
        })}
      </div>
    </TodayShell>
  );
}

// ─── (l) General tab
function TodayL({ scheme = "purple", dark = true }) {
  const habits = [
    { id: "l1", name: "Morning run", frequency: "Daily", dueTime: "07:00", streak: 12, state: "done" },
    { id: "l2", name: "Drink water", frequency: "Daily", streak: 23, state: "done" },
    { id: "l3", name: "Meditate", frequency: "Daily", dueTime: "09:00", streak: 47, state: "empty" },
    { id: "l4", name: "Stretching", frequency: "Daily", streak: 3, state: "empty" },
    { id: "l5", name: "Read 30 minutes", frequency: "Daily", streak: 8, state: "empty" },
  ];
  return (
    <TodayShell scheme={scheme} dark={dark} activeTab="general" dateLong="General">
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow showFreq={false} tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── (m) Broken streak
function TodayM({ scheme = "purple", dark = true }) {
  const habits = DEFAULT_HABITS.map(h => ({ ...h, streak: 0, state: "empty", overdue: false }));
  return (
    <TodayShell scheme={scheme} dark={dark} streak={0}
      withStatStrip statDone={0} statTotal={6}>
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={TAG_LIST} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        {habits.slice(0, 5).map(h => <HabitRow key={h.id} habit={h} />)}
      </div>
    </TodayShell>
  );
}

// ─── AI Summary close-up artboard ───────────────────────────
function AISummaryCloseup({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21"
        trailing={<UtilityCluster dark={dark} unread streak={47} />} />
      <AISummaryBlock pro />
      <InfoRow label="2 of 6 · 33%" progress={2 / 6} />
      <SectionLabel>Habits</SectionLabel>
      <div style={{ flex: 1 }} />
      <BottomNav active="today" astraUnread />
    </OrbitPhone>
  );
}

Object.assign(window, {
  TAGS, TAG_LIST, DEFAULT_HABITS,
  TodayShell, AISummaryBlock, ReflectPromptBlock,
  TodayA, TodayB, TodayC, TodayD, TodayE, TodayF,
  TodayG, TodayGFree, TodayReflect, TodayH, TodayI,
  TodayJ, TodayK, TodayL, TodayM, AISummaryCloseup,
});
