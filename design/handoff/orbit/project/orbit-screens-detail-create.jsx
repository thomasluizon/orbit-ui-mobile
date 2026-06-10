// ============================================================
// Orbit — Habit Detail · Create Habit · Goal Create · Goal Detail
// · Upgrade · Emoji sheet
// ============================================================

// ─── Last 28-day grid ───────────────────────────────────────
function Last28Grid({ done }) {
  return (
    <div style={{ padding: "12px 20px 4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 4 }}>
        {done.map((d, i) => (
          <div key={i} style={{
            aspectRatio: "1 / 1",
            background: d ? "var(--primary)" : "transparent",
            boxShadow: d ? "none" : "inset 0 0 0 1px var(--hairline-strong)",
            borderRadius: 3,
          }} />
        ))}
      </div>
      <div style={{
        marginTop: 8, display: "flex", justifyContent: "space-between",
        fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
      }}>
        <span>28 days ago</span><span>Today</span>
      </div>
    </div>
  );
}

// ─── Habit Detail shell ─────────────────────────────────────
function HabitDetailShell({
  scheme = "purple", dark = true,
  backLabel = "Today", emoji, name, summary, askPrompt = "Want to break this into smaller steps?",
  children,
}) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title={emoji ? `${emoji}  ${name}` : name}
        trailing={<QuietLink color="var(--fg-1)" style={{ marginRight: 6 }}>Edit</QuietLink>} />
      {summary && (
        <div style={{
          padding: "10px 20px",
          fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
          color: "var(--fg-3)", letterSpacing: "0.04em",
          fontVariantNumeric: "tabular-nums",
          borderBottom: "1px solid var(--hairline)",
        }}>{summary}</div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
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
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--fg-2)", lineHeight: 1.45,
          }}>{askPrompt}</div>
        </div>
      </div>
      <div style={{
        borderTop: "1px solid var(--hairline)",
        padding: "12px 20px 14px",
        display: "flex", justifyContent: "center", gap: 22,
      }}>
        <QuietLink>Edit habit</QuietLink>
        <QuietLink italic>Delete habit</QuietLink>
      </div>
    </OrbitPhone>
  );
}

function StatTriple({ items }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      padding: "14px 20px", borderBottom: "1px solid var(--hairline)",
    }}>
      {items.map(([label, val], i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)" }}>{label}</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500,
            color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em", lineHeight: 1,
          }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

function HabitDetailA({ scheme = "purple", dark = true }) {
  const done28 = Array(28).fill().map((_, i) => i !== 5 && i !== 17);
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      emoji="🧘" name="Meditate"
      summary="Streak 47 · Longest 92 · Total 412 · 85%">
      <SectionLabel>Last 28 days</SectionLabel>
      <Last28Grid done={done28} />
      <SectionLabel>Stats</SectionLabel>
      <StatTriple items={[["Streak", "47"], ["Longest", "92"], ["Monthly", "85%"]]} />
      <SectionLabel trailing={<QuietLink>Show all</QuietLink>}>Recent logs</SectionLabel>
      {[["Wed May 20", "09:04"], ["Tue May 19", "08:57"], ["Mon May 18", "09:12"]].map(([d, t]) => (
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
      <SectionLabel>Reminders</SectionLabel>
      <SettingsRow label="Same day" value="09:00" mono />
      <SettingsRow label="15 min before" value="08:45" mono />
    </HabitDetailShell>
  );
}

function HabitDetailB({ scheme = "purple", dark = true }) {
  const done28 = Array(28).fill().map((_, i) => i % 7 !== 6);
  done28[27] = false;
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      name="Weekly review"
      summary="Streak 6 · Longest 11 · Skipped today">
      <SectionLabel>Last 28 days</SectionLabel>
      <Last28Grid done={done28} />
      <SectionLabel>Stats</SectionLabel>
      <StatTriple items={[["Streak", "6"], ["Longest", "11"], ["Monthly", "75%"]]} />
    </HabitDetailShell>
  );
}

function HabitDetailC({ scheme = "purple", dark = true }) {
  const items = [
    ["Morning glass", true], ["After breakfast", true], ["Before lunch", true],
    ["Afternoon", true], ["Pre-workout", true], ["Post-workout", true],
    ["Dinner", false], ["Before bed", false],
  ];
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      emoji="💧" name="Drink water"
      summary="Streak 23 · Checklist 6/8 · Monthly 94%">
      <SectionLabel trailing={<QuietLink>Reset</QuietLink>}>Checklist · 6 / 8</SectionLabel>
      {items.map(([label, done], i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "11px 20px", borderBottom: "1px solid var(--hairline)",
        }}>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 14,
            color: done ? "var(--fg-3)" : "var(--fg-1)",
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: "var(--hairline-strong)",
          }}>{label}</span>
          <SelectCheck selected={done} size={16} />
        </div>
      ))}
    </HabitDetailShell>
  );
}

function HabitDetailD({ scheme = "purple", dark = true }) {
  const done28 = Array(28).fill(true); done28[16] = false;
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      name="Late-night screen"
      summary="Avoided 12 · Longest 27 · Last slip May 5"
      askPrompt="Want a strategy for the late-evening pull?">
      <SectionLabel>Last 28 days · avoided</SectionLabel>
      <Last28Grid done={done28} />
      <SectionLabel>Stats</SectionLabel>
      <StatTriple items={[["Avoided", "12"], ["Longest", "27"], ["Monthly", "82%"]]} />
    </HabitDetailShell>
  );
}

function HabitDetailE({ scheme = "purple", dark = true }) {
  const done28 = Array(28).fill().map((_, i) => i % 4 !== 0);
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      backLabel="All" name="Languages"
      summary="3 children · Streak 41 · 2 of 3 today"
      askPrompt="Want to add a fourth language under this parent?">
      <SectionLabel>Last 28 days</SectionLabel>
      <Last28Grid done={done28} />
      <SectionLabel>Stats</SectionLabel>
      <StatTriple items={[["Streak", "41"], ["Longest", "67"], ["Children", "3"]]} />
      <SectionLabel>Children</SectionLabel>
      <HabitRow habit={{ name: "Spanish", frequency: "Daily", streak: 41, state: "done" }} child indent={16} />
      <HabitRow habit={{ name: "French", frequency: "Daily", streak: 12, state: "empty" }} child indent={16} />
      <HabitRow habit={{ name: "Portuguese", frequency: "Daily", streak: 28, state: "done", _lastChild: true }} child indent={16} />
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <QuietLink color="var(--fg-1)">+ Add sub-habit</QuietLink>
      </div>
    </HabitDetailShell>
  );
}

function HabitDetailF({ scheme = "purple", dark = true }) {
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      name="Late-night screen"
      summary="Avoided 12 · Longest 27">
      <SectionLabel>Slip alert · Pro</SectionLabel>
      <SettingsRow label="Quiet ping on slip" accessory="none"><MonoToggle on /></SettingsRow>
      <div style={{
        padding: "10px 20px 14px", fontFamily: "var(--font-sans)", fontSize: 13,
        fontStyle: "italic", color: "var(--fg-3)", lineHeight: 1.5,
      }}>We'll send a quiet ping the morning after a slip.</div>
      <SectionLabel>Last 28 days · avoided</SectionLabel>
      <Last28Grid done={Array(28).fill(true).map((_, i) => i !== 16)} />
    </HabitDetailShell>
  );
}

function HabitDetailG({ scheme = "purple", dark = true }) {
  return (
    <HabitDetailShell scheme={scheme} dark={dark}
      emoji="📖" name="Read 30 minutes"
      summary="Streak 8 · Longest 19 · Goal: Read 12 books">
      <SectionLabel>Stats</SectionLabel>
      <StatTriple items={[["Streak", "8"], ["Longest", "19"], ["Monthly", "61%"]]} />
      <SectionLabel>Linked goal</SectionLabel>
      <SettingsRow label="Read 12 books" value="4 / 12" mono onTap={() => {}} />
    </HabitDetailShell>
  );
}

// ─── CREATE / EDIT HABIT SHEET ──────────────────────────────
function SheetBg() {
  return (
    <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21"
        trailing={<UtilityCluster dark streak={47} />} />
      <SectionLabel>Habits</SectionLabel>
    </div>
  );
}

function CreateHabitSheet({
  scheme = "purple", dark = true,
  mode = "new", habitName = "",
  frequencyType = "Recurring", showWeekDays = false, showAdvanced = false,
  validationError, subHabitContext, isPro = false,
  withSlipAlert = false, withSubHabits = false,
}) {
  const isEdit = mode === "edit";
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <SheetBg />
      <BottomSheet heightPct={92}>
        <div style={{ padding: "4px 20px 0", flex: 1, overflowY: "auto" }}>
          {subHabitContext && (
            <div style={{
              padding: "8px 0 12px",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)",
              borderBottom: "1px solid var(--hairline)", marginBottom: 10,
            }}>Parent · <span style={{ color: "var(--fg-1)" }}>{subHabitContext}</span></div>
          )}
          <div style={{
            display: "flex", justifyContent: "center", padding: "4px 0 10px",
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
          }}>{isEdit ? "Edit habit" : "New habit"}</div>

          {validationError && (
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
              color: "var(--status-overdue)", marginBottom: 10, lineHeight: 1.45,
            }}>{validationError}</div>
          )}

          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            borderBottom: "1px solid var(--hairline-strong)",
            paddingBottom: 8, marginBottom: 14,
          }}>
            <span style={{
              width: 32, height: 32, borderRadius: 999,
              boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--fg-3)", fontSize: 13,
            }}>+</span>
            <input defaultValue={habitName} placeholder="Name your habit" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>

          <SectionLabel top={6} bottom={8}>Frequency</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["One-time","Recurring","Flexible","General"].map(t => (
              <Chip key={t} active={t === frequencyType}>{t}</Chip>
            ))}
          </div>

          {(frequencyType === "Recurring" || frequencyType === "Flexible") && (
            <div style={{
              padding: "14px 0 10px", marginTop: 14,
              display: "flex", alignItems: "center", gap: 10,
              borderBottom: "1px solid var(--hairline)",
            }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)" }}>{frequencyType === "Flexible" ? "Times per" : "Every"}</span>
              <Stepper value={1} />
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                {["Day","Week","Month","Year"].map((u, i) => (
                  <Chip key={u} active={i === 0}>{u}</Chip>
                ))}
              </div>
            </div>
          )}

          {showWeekDays && (
            <div style={{
              padding: "12px 0 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "1px solid var(--hairline)",
            }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>Days</span>
              <div style={{ display: "flex", gap: 6 }}>
                {["M","T","W","T","F","S","S"].map((d, i) => (
                  <Chip key={i} active={i < 5}>{d}</Chip>
                ))}
              </div>
            </div>
          )}
          {frequencyType !== "General" && (
            <>
              <SettingsRow label="Due date" value="Thu, May 21" mono onTap={() => {}} />
              <SettingsRow label="Due time" value="07:00" mono onTap={() => {}} />
            </>
          )}

          <SectionLabel top={20} bottom={8}>Tags</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingBottom: 14, borderBottom: "1px solid var(--hairline)" }}>
            {[
              { name: "Health", color: "#6d9a78", active: true },
              { name: "Body", color: "#a08960" },
              { name: "Mind", color: "#7c6d9a" },
              { name: "Work", color: "#5a7a9a" },
            ].map(t => (
              <TagChip key={t.name} tag={t} active={t.active} />
            ))}
            <QuietLink color="var(--fg-1)">+ New tag</QuietLink>
          </div>

          <div style={{ padding: "18px 0 6px", display: "flex", justifyContent: "center" }}>
            <button style={{
              appearance: "none", border: 0, background: "transparent", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)",
              display: "inline-flex", alignItems: "center", gap: 6, padding: 0,
            }}>
              More options
              <Icon name={showAdvanced ? "chevron-up" : "chevron-down"} size={14} color="var(--fg-2)" />
            </button>
          </div>

          {showAdvanced && (
            <>
              <SectionLabel top={16} bottom={6}>Description</SectionLabel>
              <UnderlinedInput placeholder="Why this habit matters" multiline rows={2} />

              <SectionLabel top={18} bottom={8}>Reminders</SectionLabel>
              <SettingsRow label="Reminders" accessory="none"><MonoToggle on /></SettingsRow>
              <div style={{ padding: "10px 0 14px", display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--hairline)" }}>
                {["At time","15 min","30 min","1 hr","1 day","+ Custom"].map((p, i) => (
                  <Chip key={p} active={i === 1}>{p}</Chip>
                ))}
              </div>

              <SectionLabel top={18} bottom={8}>Goal link</SectionLabel>
              {isPro ? (
                <div style={{ padding: "10px 0 14px", display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid var(--hairline)" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)" }}>None</span>
                  <QuietLink color="var(--fg-1)">+ Link goal</QuietLink>
                </div>
              ) : <LockedBlock />}

              <SettingsRow label="Bad habit" accessory="none"><MonoToggle on={false} /></SettingsRow>

              {withSlipAlert && (
                <>
                  <SectionLabel top={18} bottom={8}>Slip alert · Pro</SectionLabel>
                  <SettingsRow label="Quiet ping on slip" accessory="none"><MonoToggle on /></SettingsRow>
                </>
              )}
            </>
          )}

          {!isEdit && withSubHabits && (
            <>
              <SectionLabel top={20} bottom={8}>Sub-habits · Pro</SectionLabel>
              {isPro ? (
                <div style={{ paddingBottom: 12 }}>
                  {["Drink water", "Stretch 5 min"].map((s, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 0", borderBottom: "1px solid var(--hairline)",
                    }}>
                      <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{s}</span>
                      <Icon name="x" size={14} strokeWidth={1.6} color="var(--fg-4)" />
                    </div>
                  ))}
                  <div style={{ padding: "10px 0" }}><QuietLink color="var(--fg-1)">+ Add sub-habit</QuietLink></div>
                </div>
              ) : <LockedBlock />}
            </>
          )}
          <div style={{ height: 80 }} />
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px",
          borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>{isEdit ? "Save changes" : "Create habit"}</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

function Stepper({ value = 1 }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 0,
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
      borderRadius: 6,
    }}>
      <button style={stepBtn}>−</button>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500,
        color: "var(--fg-1)", padding: "0 8px",
        fontVariantNumeric: "tabular-nums", minWidth: 14, textAlign: "center",
      }}>{value}</span>
      <button style={stepBtn}>+</button>
    </div>
  );
}
const stepBtn = {
  appearance: "none", border: 0, background: "transparent", cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg-2)",
  width: 26, height: 26,
};

function LockedBlock() {
  return (
    <div style={{
      padding: "12px 14px", marginBottom: 14,
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
      borderRadius: 8,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icon name="lock" size={13} strokeWidth={1.6} color="var(--fg-3)" />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)" }}>Available with Pro</span>
      </span>
      <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
    </div>
  );
}

// ─── Emoji sheet ────────────────────────────────────────────
function EmojiSheet({ scheme = "purple", dark = true }) {
  const cats = ["Smileys","Animals","Food","Activities","Objects","Symbols","Flags","Recent"];
  const emojis = ["😀","😊","🙂","😎","😴","🤩","😇","🧐","🤓","🥳","🤗","😌","😍","🤔","😮","😅","😪","😶","🙃","🤨","😏","😬","😉","😛","😝","🤐","😯","😶","😑","😐","😒","🙄"];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <SheetBg />
      <BottomSheet heightPct={88}>
        <div style={{ padding: "8px 20px 0", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "center",
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
          }}>Choose emoji</div>
          <UnderlinedInput placeholder="Search emoji" />
          <div style={{
            display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none",
            paddingBottom: 4, flexShrink: 0,
          }}>
            {cats.map((c, i) => <Chip key={c} active={i === 0}>{c}</Chip>)}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
              {emojis.map((e, i) => (
                <button key={i} style={{
                  appearance: "none", border: 0, background: "transparent", cursor: "pointer",
                  width: 36, height: 36, fontSize: 22, borderRadius: 6,
                }}>{e}</button>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Create Goal sheet ──────────────────────────────────────
function CreateGoalSheet({
  scheme = "purple", dark = true,
  mode = "new", goalType = "Standard", deadlineInPast = false,
  validationError, immutable = false,
}) {
  const isEdit = mode === "edit";
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <SheetBg />
      <BottomSheet heightPct={84}>
        <div style={{ padding: "4px 20px 0", flex: 1, overflowY: "auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "4px 0 10px",
          }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>{isEdit ? "Edit goal" : "New goal"}</div>
            {immutable && <ProTag>Streak · Immutable</ProTag>}
          </div>
          {validationError && (
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
              color: "var(--status-overdue)", marginBottom: 10,
            }}>{validationError}</div>
          )}
          <div style={{
            borderBottom: "1px solid var(--hairline-strong)",
            paddingBottom: 8, marginBottom: 14,
          }}>
            <input placeholder="Goal title" style={{
              width: "100%", appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>

          {!immutable && (
            <>
              <SectionLabel top={4} bottom={8}>Type</SectionLabel>
              <div style={{ display: "flex", gap: 6 }}>
                <Chip active={goalType === "Standard"}>Standard</Chip>
                <Chip active={goalType === "Streak"}>Streak</Chip>
              </div>
            </>
          )}
          {goalType === "Streak" && (
            <div style={{ padding: "14px 0 4px", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>Continue as long as possible.</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>One miss breaks the streak.</span>
            </div>
          )}

          <SectionLabel top={20} bottom={8}>Target</SectionLabel>
          <div style={{ display: "flex", gap: 14 }}>
            <UnderlinedInput label="Value" placeholder="0" mono />
            <UnderlinedInput label="Unit" placeholder={goalType === "Streak" ? "days" : "km"} />
          </div>

          <SectionLabel top={20} bottom={6}>Description</SectionLabel>
          <UnderlinedInput placeholder="Optional context" />

          <SectionLabel top={20} bottom={8}>Deadline</SectionLabel>
          <SettingsRow label="Deadline" value="Jun 30, 2026" mono onTap={() => {}} />
          {deadlineInPast && (
            <div style={{ padding: "10px 0", fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--status-overdue)" }}>That date is in the past.</div>
          )}
          <div style={{ height: 60 }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>{isEdit ? "Save changes" : "Create goal"}</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Goal Detail drawer ─────────────────────────────────────
function GoalDetail({ scheme = "purple", dark = true, variant = "standard-track" }) {
  const v = variant;
  const isStreak = v === "streak";
  const isCompleted = v === "completed";
  const isAbandoned = v === "abandoned";
  const isUpdating = v === "update";
  const status = isCompleted ? "Completed" : isAbandoned ? "Abandoned"
    : v === "at-risk" ? "At risk" : v === "behind" ? "Behind" : "On track";
  const statusColor = isCompleted ? "var(--primary)" : isAbandoned ? "var(--fg-3)"
    : v === "at-risk" ? "var(--status-overdue)" : v === "behind" ? "var(--status-bad)" : "var(--primary)";
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title={isStreak ? "Meditate 30 days" : "Read 12 books"}
        trailing={<QuietLink color="var(--fg-1)" style={{ marginRight: 6 }}>Edit</QuietLink>} />
      <div style={{
        padding: "10px 20px",
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
        color: "var(--fg-3)", letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
        borderBottom: "1px solid var(--hairline)",
      }}>{isStreak ? "Streak · days · 18 days left" : "Standard · books · Due Dec 31"}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Progress</SectionLabel>
        <div style={{ padding: "10px 20px 16px" }}>
          <div style={{ height: 5, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: isStreak ? "40%" : "33%", background: "var(--primary)", borderRadius: 999,
            }} />
          </div>
          <div style={{
            marginTop: 10, display: "flex", justifyContent: "space-between",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-2)",
            fontVariantNumeric: "tabular-nums",
          }}>
            <span>{isStreak ? "Day 12 of 30" : "4 / 12 books · 33%"}</span>
            {!isAbandoned && !isCompleted && <QuietLink color="var(--fg-1)">Update progress</QuietLink>}
          </div>
        </div>

        {isUpdating && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 10 }}>
            <UnderlinedInput label="Current value" placeholder="5" mono />
            <UnderlinedInput label="Progress note" placeholder="Finished Tolstoy" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 14 }}>
              <QuietLink>Cancel</QuietLink>
              <QuietLink color="var(--fg-1)">Save</QuietLink>
            </div>
          </div>
        )}

        {!isAbandoned && !isCompleted && (
          <>
            <SectionLabel>Metrics</SectionLabel>
            <SettingsRow label="Status" accessory="none">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor, marginRight: 8 }} />
              <span style={{ color: "var(--fg-1)" }}>{status}</span>
            </SettingsRow>
            <SettingsRow label={isStreak ? "Days remaining" : "Projected completion"}
              value={isStreak ? "18" : "Jun 28"} mono />
            <SettingsRow label="Velocity" value={isStreak ? "—" : "0.4 km / day"} mono />
          </>
        )}

        <SectionLabel>Linked habits</SectionLabel>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>Read 30 minutes</span>
          <div style={{ width: 80, height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "85%", background: "var(--primary)", borderRadius: 999 }} />
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-1)", fontWeight: 500 }}>85%</span>
        </div>

        <SectionLabel>History</SectionLabel>
        {[
          ["May 18", "8 → 10 km"],
          ["May 11", "5 → 8 km", "Long Sunday run."],
          ["May 04", "2 → 5 km"],
        ].map(([date, change, note], i) => (
          <div key={i} style={{
            padding: "10px 20px", borderBottom: "1px solid var(--hairline)",
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>{date}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-1)", fontWeight: 500 }}>{change}</span>
            </div>
            {note && <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)" }}>{note}</div>}
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--hairline)", padding: "12px 20px" }}>
        <div style={{ position: "relative", paddingLeft: 14 }}>
          <span style={{
            position: "absolute", left: 0, top: 4, bottom: 4, width: 2,
            background: "var(--primary)", borderRadius: 1,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Icon name="sparkles" size={12} strokeWidth={1.7} color="var(--primary)" />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500, color: "var(--fg-3)", letterSpacing: "0.06em" }}>ASK ASTRA</span>
          </div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--fg-2)", lineHeight: 1.45,
          }}>Want a weekly check-in plan for this?</div>
        </div>
      </div>
      <div style={{
        borderTop: "1px solid var(--hairline)",
        padding: "12px 20px 14px",
        display: "flex", justifyContent: "center", gap: 22,
      }}>
        {isAbandoned || isCompleted
          ? <QuietLink color="var(--fg-1)">Reactivate</QuietLink>
          : <>
              <QuietLink color="var(--fg-1)">Mark completed</QuietLink>
              <QuietLink>Mark abandoned</QuietLink>
            </>}
        <QuietLink italic>Delete</QuietLink>
      </div>
    </OrbitPhone>
  );
}

// ─── Upgrade ────────────────────────────────────────────────
function UpgradeScreen({ scheme = "purple", dark = true }) {
  const [plan, setPlan] = React.useState("yearly");
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Orbit Pro" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{
          padding: "28px 20px 24px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--hairline)",
        }}>
          <div style={{ color: "var(--primary)" }}>
            <Icon name="sparkles" size={36} strokeWidth={1.4} color="var(--primary)" />
          </div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
            color: "var(--fg-1)", letterSpacing: "-0.015em", textAlign: "center",
          }}>Talk to Astra. Track the long arc.</div>
        </div>
        <SectionLabel>Included</SectionLabel>
        {[
          ["Goals", "Long-arc tracking beyond daily check-ins"],
          ["Reflect", "Talk to Astra about your day"],
          ["Sub-habits", "Break habits into named children"],
          ["AI summary", "A quiet line about today on the Today screen"],
          ["Calendar sync", "Import events as one-time tasks"],
          ["Achievements", "Unlock the full ledger"],
        ].map(([t, d]) => (
          <div key={t} style={{
            display: "flex", alignItems: "baseline", gap: 10,
            padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-1)", minWidth: 110 }}>{t}</span>
            <span style={{ color: "var(--fg-4)" }}>·</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", lineHeight: 1.45 }}>{d}</span>
          </div>
        ))}
        <SectionLabel>Plan</SectionLabel>
        <PlanRow label="Monthly" price="$4.99" sub="billed each month" active={plan === "monthly"} onClick={() => setPlan("monthly")} />
        <PlanRow label="Yearly"  price="$39"   sub="billed once a year · save 35%" active={plan === "yearly"} onClick={() => setPlan("yearly")} />
        <div style={{ padding: "20px 20px 8px" }}>
          <PrimaryButton fullWidth>Start 7-day trial</PrimaryButton>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 24px" }}>
          <QuietLink>Restore purchase</QuietLink>
        </div>
      </div>
    </OrbitPhone>
  );
}

function PlanRow({ label, price, sub, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: "13px 20px", borderBottom: "1px solid var(--hairline)",
      cursor: "pointer", display: "flex", alignItems: "baseline", gap: 10,
      background: active ? "var(--bg-elev)" : "transparent",
    }}>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-1)", minWidth: 70 }}>{label}</span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600,
        color: active ? "var(--primary)" : "var(--fg-1)", fontVariantNumeric: "tabular-nums",
      }}>{price}</span>
      <span style={{ flex: 1, color: "var(--fg-3)", fontFamily: "var(--font-sans)", fontSize: 13 }}>· {sub}</span>
    </div>
  );
}

Object.assign(window, {
  Last28Grid, StatTriple, HabitDetailShell,
  HabitDetailA, HabitDetailB, HabitDetailC, HabitDetailD, HabitDetailE, HabitDetailF, HabitDetailG,
  SheetBg, CreateHabitSheet, EmojiSheet, CreateGoalSheet, GoalDetail, UpgradeScreen, LockedBlock, Stepper, PlanRow,
});
