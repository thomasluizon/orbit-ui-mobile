// ============================================================
// Orbit — Extra variants for FIX 3 & 4
// - Templates sheet, Tag editor (inline), Scheduled reminders form
// - Streak variants (low/frozen/monthly-limit/legendary)
// - Achievements variants (category/locked-detail/earned-detail/rarity-legend)
// - Upgrade variants (in-trial/expired)
// - Profile account-actions variant
// - AI Settings facts paginated/select/empty
// ============================================================

// ─── Checklist Templates sheet ──────────────────────────────
function ChecklistTemplatesSheet({ scheme = "purple", dark = true }) {
  const templates = [
    ["Morning routine", "Drink water · Stretch · Meditate · Plan · Coffee", true],
    ["Workout", "Warm up · Lift · Stretch", false],
    ["Evening wind-down", "Tidy desk · Read · Lights out", false],
    ["Weekly review", "Calendar · Notes · Finances · Plan", false],
    ["Travel prep", "Pack · Passport · Tickets · Charger", false],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <SheetBg />
      <BottomSheet heightPct={64}>
        <div style={{ padding: "10px 20px 0", flex: 1, overflowY: "auto" }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "var(--fg-1)",
            padding: "4px 0 14px",
          }}>Templates</div>
          {templates.map(([title, preview, selected]) => (
            <div key={title} style={{
              padding: "12px 0", borderBottom: "1px solid var(--hairline)",
              display: "flex", flexDirection: "column", gap: 4,
              background: selected ? "var(--bg-sunk)" : "transparent",
              marginLeft: selected ? -12 : 0, marginRight: selected ? -12 : 0,
              paddingLeft: selected ? 12 : 0, paddingRight: selected ? 12 : 0,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: selected ? 600 : 500, color: "var(--fg-1)" }}>{title}</span>
                {selected && <Icon name="check" size={14} strokeWidth={1.8} color="var(--primary)" />}
              </div>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontStyle: "italic", color: "var(--fg-3)" }}>{preview}</span>
            </div>
          ))}
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>Use template</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Tag editor inline form (within Create Habit sheet) ─────
function TagEditorInline({ mode = "new", value = "", color = "#7c6d9a" }) {
  const swatches = ["#7c3aed","#2563eb","#16a34a","#e11d48","#ea580c","#0891b2","#d97706","#64748b"];
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8,
      background: "var(--bg-sunk)",
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
      display: "flex", flexDirection: "column", gap: 12, marginTop: 12,
    }}>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
      }}>{mode === "new" ? "New tag" : "Edit tag"}</div>
      <UnderlinedInput placeholder="Tag name" value={value} mono />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {swatches.map(c => (
          <span key={c} style={{
            width: 24, height: 24, borderRadius: 999,
            background: c,
            boxShadow: c === color ? "0 0 0 2px var(--fg-1)" : "none",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <QuietLink color="var(--fg-1)">Save</QuietLink>
          <QuietLink>Cancel</QuietLink>
        </div>
        {mode === "edit" && <QuietLink italic>Delete tag</QuietLink>}
      </div>
    </div>
  );
}

// Create Habit sheet variant: tag editor open
function CreateHabitTagEditor({ scheme = "purple", dark = true, mode = "new" }) {
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
              color: "var(--fg-3)", fontSize: 13,
            }}>+</span>
            <input defaultValue="Read 30 minutes" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>
          <SectionLabel top={6} bottom={8}>Tags</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { name: "Health", color: "#6d9a78" },
              { name: "Body", color: "#a08960" },
              { name: "Reading", color: "#9a6d8c", active: mode === "edit" },
            ].map(t => <TagChip key={t.name} tag={t} active={t.active} />)}
          </div>
          <TagEditorInline mode={mode} value={mode === "edit" ? "Reading" : ""}
            color={mode === "edit" ? "#9a6d8c" : "#7c3aed"} />
          <div style={{ height: 60 }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>Create habit</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Create Habit · End date set variant ────────────────────
function CreateHabitEndDate({ scheme = "purple", dark = true }) {
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
              color: "var(--fg-3)", fontSize: 13,
            }}>+</span>
            <input defaultValue="Couch to 5K" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>
          <SectionLabel top={4} bottom={8}>Schedule</SectionLabel>
          <SettingsRow label="Frequency" value="Recurring · Daily" mono />
          <SettingsRow label="Due time" value="07:00" mono />
          <SettingsRow label="End date" value="Jun 30, 2026" mono onTap={() => {}} />
          <div style={{ padding: "8px 0 14px" }}>
            <QuietLink italic>Clear</QuietLink>
          </div>
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>Create habit</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Create Habit · Scheduled reminders (no due time) ───────
function CreateHabitScheduledReminders({ scheme = "purple", dark = true }) {
  const reminders = [
    ["Day before", "18:00"],
    ["Same day", "07:00"],
    ["Day before", "21:00"],
  ];
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
              color: "var(--fg-3)", fontSize: 13,
            }}>+</span>
            <input defaultValue="Pay rent" style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
              color: "var(--fg-1)", letterSpacing: "-0.015em", padding: 0,
            }} />
          </div>
          <SectionLabel top={4} bottom={8}>Schedule</SectionLabel>
          <SettingsRow label="Frequency" value="Monthly · 1st" mono />
          <SettingsRow label="Due time" value="Not set" mono />
          <SectionLabel top={16} bottom={8}>Scheduled reminders</SectionLabel>
          <SettingsRow label="Reminders" accessory="none"><MonoToggle on /></SettingsRow>
          {reminders.map(([when, time], i) => (
            <div key={i} style={{
              padding: "12px 20px 12px 0", borderBottom: "1px solid var(--hairline)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-1)",
                fontVariantNumeric: "tabular-nums",
              }}>{when} · {time}</span>
              <span style={{ flex: 1 }} />
              <Icon name="x" size={14} strokeWidth={1.7} color="var(--fg-4)" />
            </div>
          ))}
          <div style={{ padding: "12px 0 8px" }}>
            <QuietLink color="var(--fg-1)">+ Add reminder</QuietLink>
          </div>
          <div style={{ height: 80 }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px 16px", borderTop: "1px solid var(--hairline)",
        }}>
          <QuietLink>Cancel</QuietLink>
          <PrimaryButton>Create habit</PrimaryButton>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Streak detail · extra variants ─────────────────────────
function StreakDetailLow({ scheme = "purple", dark = true }) {
  return <StreakDetailVariant value={3} tier="Normal"
    encourage="Three days in. Keep going." scheme={scheme} dark={dark} active={3} />;
}
function StreakDetailFrozen({ scheme = "purple", dark = true }) {
  return <StreakDetailVariant value={47} tier="Strong" frozenToday
    encourage="Frozen today. Your streak holds." scheme={scheme} dark={dark} active={2} />;
}
function StreakDetailMonthlyLimit({ scheme = "purple", dark = true }) {
  return <StreakDetailVariant value={47} tier="Strong" monthlyLimit
    encourage="Forty-seven days. The longest run yet." scheme={scheme} dark={dark} active={3} />;
}
function StreakDetailLegendary({ scheme = "purple", dark = true }) {
  return <StreakDetailVariant value={365} tier="Legendary"
    encourage="A year of showing up." scheme={scheme} dark={dark} active={7} />;
}

function StreakDetailVariant({ value, tier, encourage, frozenToday, monthlyLimit, scheme, dark, active }) {
  const weekDays = [
    "M 19","T 20","W 21","T 22","F 23","S 24","S 25",
  ].map((d, i) => {
    if (i < active) return { date: d, state: i === 2 && frozenToday ? "frozen" : (i === 2 ? "today" : "active") };
    if (i === active) return { date: d, state: "today" };
    return { date: d, state: "future" };
  });
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Streak" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{
          padding: "32px 20px 28px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          borderBottom: "1px solid var(--hairline)",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
            color: frozenToday ? "var(--status-frozen)" : "var(--fg-3)", letterSpacing: "0.06em",
          }}>{frozenToday ? "Frozen today" : "Current streak"}</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: value > 100 ? 64 : 80, fontWeight: 500,
            letterSpacing: "-0.04em", lineHeight: 0.9, color: "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
          }}>{value}</span>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--fg-3)", textAlign: "center",
          }}>{encourage}</span>
        </div>
        <SectionLabel>This week</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 20px 14px", gap: 6 }}>
          {weekDays.map((d, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 0" }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                color: d.state === "today" || d.state === "frozen" ? "var(--fg-1)" : "var(--fg-3)",
              }}>{d.date}</span>
              {d.state === "active" && <div style={{ width: 7, height: 7, borderRadius: 999, background: "var(--fg-1)" }} />}
              {d.state === "today" && <div style={{ width: 7, height: 7, borderRadius: 999, background: "var(--primary)" }} />}
              {d.state === "frozen" && (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--status-frozen)" strokeWidth="1.2">
                  <circle cx="5" cy="5" r="4" />
                  <line x1="5" y1="2" x2="5" y2="8" />
                  <line x1="2" y1="5" x2="8" y2="5" />
                </svg>
              )}
              {d.state === "future" && <div style={{ width: 7, height: 7 }} />}
            </div>
          ))}
        </div>
        <SectionLabel>Freeze</SectionLabel>
        {monthlyLimit ? (<>
          <SettingsRow label="Available" value="0" accessory="none" mono />
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--hairline)" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>Monthly limit reached. Resets June 1.</span>
          </div>
        </>) : (<>
          <SettingsRow label="Available" accessory="none">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg-1)", fontWeight: 600 }}>1</span>
            <QuietLink color="var(--fg-1)" style={{ marginLeft: 12 }}>Use</QuietLink>
          </SettingsRow>
          <SettingsRow label="This month" value={monthlyLimit ? "3 / 3 used" : "0 / 3 used"} accessory="none" mono />
        </>)}
        <SectionLabel>Tier</SectionLabel>
        <div style={{ padding: "10px 20px 18px", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--primary)" }} />
            {tier}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

// ─── Achievements · extra variants ──────────────────────────
function AchievementsCategory({ scheme = "purple", dark = true }) {
  const items = [
    ["First habit", "Created your first habit", "common", "Mar 1"],
    ["First log", "Logged your first day", "common", "Mar 1"],
    ["First week", "Logged seven days in a row", "uncommon", "Mar 8"],
    ["First month", "Logged thirty days", "rare", null],
    ["First goal", "Created your first goal", "common", null],
  ];
  const rarityGlyph = { common: "◇", uncommon: "◈", rare: "◆", epic: "★", legendary: "✦" };
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Achievements" subtitle="Level 7 · Steady hand" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Getting started</SectionLabel>
        {items.map(([title, desc, rarity, earned]) => (
          <div key={title} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "13px 20px", borderBottom: "1px solid var(--hairline)",
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 16,
              color: earned ? "var(--fg-1)" : "var(--fg-4)",
              width: 18, textAlign: "center",
            }}>{rarityGlyph[rarity]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: earned ? "var(--fg-1)" : "var(--fg-3)" }}>{title}</div>
              {earned && <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontStyle: "italic", color: "var(--fg-3)", marginTop: 2 }}>{desc}</div>}
            </div>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, color: earned ? "var(--fg-3)" : "var(--fg-4)",
              fontStyle: earned ? "normal" : "italic",
            }}>{earned ? `Earned · ${earned}` : "Locked"}</span>
          </div>
        ))}
      </div>
    </OrbitPhone>
  );
}

function AchievementsLockedDetail({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Achievements" subtitle="Level 7 · Steady hand" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Consistency</SectionLabel>
        <div style={{ padding: "13px 20px", background: "var(--bg-sunk)", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--fg-4)", width: 18, textAlign: "center" }}>◆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-3)" }}>Steady hand · 30 days</div>
            </div>
            <Icon name="chevron-up" size={14} color="var(--fg-3)" />
          </div>
          <div style={{
            paddingLeft: 30, paddingTop: 10,
            fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)",
            lineHeight: 1.5,
          }}>Earn this by logging 30 consecutive days.</div>
          <div style={{ paddingLeft: 30, paddingTop: 10, paddingRight: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>Progress</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-1)", fontWeight: 500 }}>17 / 30</span>
            </div>
            <div style={{ height: 3, background: "var(--bg)", borderRadius: 999, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "57%", background: "var(--fg-1)", borderRadius: 999 }} />
            </div>
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

function AchievementsEarnedDetail({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Achievements" subtitle="Level 7 · Steady hand" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Consistency</SectionLabel>
        <div style={{ padding: "13px 20px", background: "var(--bg-sunk)", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--fg-1)", width: 18, textAlign: "center" }}>◆</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)", fontWeight: 600 }}>Steady hand</div>
            </div>
            <Icon name="chevron-up" size={14} color="var(--fg-3)" />
          </div>
          <div style={{
            paddingLeft: 30, paddingTop: 8,
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
          }}>Earned · Apr 30, 2026</div>
          <div style={{
            paddingLeft: 30, paddingTop: 8,
            fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)",
            lineHeight: 1.5,
          }}>Forty-seven-day streak. The longest run yet.</div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

function AchievementsRarityLegend({ scheme = "purple", dark = true }) {
  const rarities = [["◇","Common"],["◈","Uncommon"],["◆","Rare"],["★","Epic"],["✦","Legendary"]];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Achievements" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Rarity</SectionLabel>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          padding: "16px 20px 24px", gap: 4,
        }}>
          {rarities.map(([g, n]) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--fg-1)" }}>{g}</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--fg-3)" }}>{n}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px 24px", borderTop: "1px solid var(--hairline)" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)", lineHeight: 1.55 }}>
            Rarity is glyph shape, not color. Earned glyphs are full-tone; locked are dimmed.
          </span>
        </div>
      </div>
    </OrbitPhone>
  );
}

// ─── Upgrade · extra variants ───────────────────────────────
function UpgradeInTrial({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Orbit Pro" />
      <EdgeBanner>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>
          Trial · <span style={{ color: "var(--fg-1)" }}>4 days left</span>
        </span>
        <QuietLink color="var(--fg-1)">Manage</QuietLink>
      </EdgeBanner>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{
          padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          borderBottom: "1px solid var(--hairline)",
        }}>
          <Icon name="sparkles" size={32} strokeWidth={1.4} color="var(--primary)" />
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600, color: "var(--fg-1)", textAlign: "center" }}>Keep Pro after the trial.</div>
        </div>
        <SectionLabel>Plan</SectionLabel>
        <PlanRow label="Monthly" price="$4.99" sub="billed each month" />
        <PlanRow label="Yearly"  price="$39"   sub="save 35%" active />
        <div style={{ padding: "20px 20px 8px" }}>
          <PrimaryButton fullWidth>Subscribe</PrimaryButton>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 24px" }}>
          <QuietLink>Restore purchase</QuietLink>
        </div>
      </div>
    </OrbitPhone>
  );
}

function UpgradeExpired({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Orbit Pro" />
      <EdgeBanner>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--status-overdue)" }}>
          Trial ended. Pro features paused.
        </span>
      </EdgeBanner>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Plan</SectionLabel>
        <PlanRow label="Monthly" price="$4.99" sub="billed each month" />
        <PlanRow label="Yearly"  price="$39"   sub="save 35%" active />
        <div style={{ padding: "20px 20px 8px" }}>
          <PrimaryButton fullWidth>Resume Pro</PrimaryButton>
        </div>
        <div style={{ padding: "10px 20px 24px", display: "flex", justifyContent: "center" }}>
          <QuietLink color="var(--fg-1)">Restore purchase</QuietLink>
        </div>
      </div>
    </OrbitPhone>
  );
}

// ─── Profile · scrolled to account actions ──────────────────
function ProfileAccountActions({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="user" title="You" trailing={<UtilityCluster dark streak={47} />} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Subscription</SectionLabel>
        <SettingsRow label="Plan" value="Free" onTap={() => {}}>
          <ProTag>Pro</ProTag>
        </SettingsRow>
        <SectionLabel>Account actions</SectionLabel>
        <SettingsRow label="Sign out" onTap={() => {}} accessory="none" />
        <SettingsRow label="Fresh start" onTap={() => {}} accessory="none" />
        <SettingsRow label="Delete account" onTap={() => {}} accessory="none">
          <span style={{ fontStyle: "italic", color: "var(--fg-3)" }}>Destructive</span>
        </SettingsRow>
        <div style={{ padding: "16px 20px", fontFamily: "var(--font-sans)", fontSize: 12, fontStyle: "italic", color: "var(--fg-4)" }}>
          Fresh start removes habits but keeps your account. Delete account is permanent.
        </div>
      </div>
      <BottomNav active="profile" />
    </OrbitPhone>
  );
}

// ─── AI Settings · facts paginated / select / empty ─────────
function AISettingsFactsPaginated({ scheme = "purple", dark = true }) {
  const facts = [
    ["PREFERENCE", "Likes 30-minute reading sessions in the evening."],
    ["ROUTINE", "Does weekly review on Sunday at 18:00."],
    ["CONTEXT", "Works remote from a home office."],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="AI Settings" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel trailing={<span style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)",
          fontVariantNumeric: "tabular-nums",
        }}>
          Page <span style={{ color: "var(--fg-1)" }}>2</span> / 3
          <Icon name="chevron-left" size={12} color="var(--fg-3)" />
          <Icon name="chevron-right" size={12} color="var(--fg-3)" />
        </span>}>What Astra knows</SectionLabel>
        {facts.map(([cat, fact]) => (
          <div key={fact} style={{
            padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
              color: "var(--fg-2)", letterSpacing: "0.06em",
              padding: "2px 6px", borderRadius: 4,
              alignSelf: "flex-start", boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
            }}>{cat}</span>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{fact}</span>
              <Icon name="x" size={14} strokeWidth={1.6} color="var(--fg-4)" />
            </div>
          </div>
        ))}
      </div>
    </OrbitPhone>
  );
}

function AISettingsFactsSelect({ scheme = "purple", dark = true }) {
  const facts = [
    ["PREFERENCE", "Reads literary fiction in the evenings.", true],
    ["ROUTINE",    "Runs at 07:00 most weekdays.", true],
    ["CONTEXT",    "Lives in São Paulo.", true],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="AI Settings" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>What Astra knows</SectionLabel>
        <div style={{
          padding: "8px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: "1px solid var(--hairline)",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--fg-1)",
            fontVariantNumeric: "tabular-nums",
          }}>3 selected</span>
          <div style={{ display: "flex", gap: 14 }}>
            <QuietLink color="var(--fg-1)">Select all</QuietLink>
            <QuietLink italic>Delete selected</QuietLink>
          </div>
        </div>
        {facts.map(([cat, fact, sel]) => (
          <div key={fact} style={{
            padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
            display: "flex", gap: 12, alignItems: "center",
            background: sel ? "var(--bg-sunk)" : "transparent",
          }}>
            <SelectCheck selected={sel} size={16} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                color: "var(--fg-2)", letterSpacing: "0.06em",
                padding: "2px 6px", borderRadius: 4,
                alignSelf: "flex-start", boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
              }}>{cat}</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{fact}</span>
            </div>
          </div>
        ))}
      </div>
    </OrbitPhone>
  );
}

function AISettingsFactsEmpty({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="AI Settings" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>What Astra knows</SectionLabel>
        <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Icon name="sparkles" size={28} strokeWidth={1.4} color="var(--fg-3)" />
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--fg-3)", textAlign: "center", lineHeight: 1.5,
          }}>Astra hasn't learned anything yet. Have a conversation in Chat to teach it.</span>
        </div>
      </div>
    </OrbitPhone>
  );
}

// ─── Habit row meta variants for demo ───────────────────────
function HabitMetaSampler({ scheme = "purple", dark = true }) {
  const rows = [
    { emoji: "🏃", name: "Morning run", frequency: "Daily", dueTime: "07:00", streak: 47, state: "empty" },
    { emoji: "💧", name: "Drink water", frequency: "Daily", checklist: { done: 6, total: 8 }, state: "done" },
    { name: "Plan the week", frequency: "Weekly · Mon Wed Fri", streak: 14, state: "empty" },
    { name: "Yoga", frequency: "Every 3 days", streak: 12, state: "empty" },
    { name: "Long run", frequency: "Flexible · 3 / 5 this week", state: "empty" },
    { emoji: "📖", name: "Read 30 minutes", frequency: "Daily", dueTime: "21:00", state: "empty", overdue: true },
    { name: "Late-night screen", frequency: "Daily", state: "empty", bad: true, streak: 12 },
    { name: "Stretching", frequency: "General · No schedule", state: "empty" },
    { name: "Renew passport", frequency: "One-time", state: "empty" },
    { emoji: "📝", name: "Weekly review", frequency: "Daily", streak: 47, state: "empty", linkedGoal: "Weekly review" },
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Habit row meta" subtitle="All combinations" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {rows.map((h, i) => <HabitRow key={i} habit={h} />)}
      </div>
    </OrbitPhone>
  );
}

Object.assign(window, {
  ChecklistTemplatesSheet, TagEditorInline, CreateHabitTagEditor,
  CreateHabitEndDate, CreateHabitScheduledReminders,
  StreakDetailLow, StreakDetailFrozen, StreakDetailMonthlyLimit, StreakDetailLegendary,
  AchievementsCategory, AchievementsLockedDetail, AchievementsEarnedDetail, AchievementsRarityLegend,
  UpgradeInTrial, UpgradeExpired, ProfileAccountActions,
  AISettingsFactsPaginated, AISettingsFactsSelect, AISettingsFactsEmpty,
  HabitMetaSampler,
});
