// ============================================================
// Orbit — Sub-screens: Preferences · Advanced · About · Privacy ·
// Support · AI Settings · Retrospective · Calendar Sync
// ============================================================

function PreferencesScreen({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Preferences" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Language</SectionLabel>
        <div style={{ padding: "10px 20px 14px", borderBottom: "1px solid var(--hairline)", display: "flex", gap: 6 }}>
          <Chip active>English</Chip>
          <Chip>Português (BR)</Chip>
        </div>

        <SectionLabel>Appearance</SectionLabel>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Theme</span>
          <div style={{ display: "flex", gap: 6 }}>
            <Chip>Light</Chip>
            <Chip active>Dark</Chip>
          </div>
        </div>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Scheme</span>
          <SchemeSwatches active="purple" lockNonDefault />
        </div>

        <SectionLabel>Schedule</SectionLabel>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Week starts on</span>
          <div style={{ display: "flex", gap: 4 }}>
            {["Su","M","Tu","W","Th","F","Sa"].map((d, i) => <Chip key={i} active={i === 1}>{d}</Chip>)}
          </div>
        </div>

        <SectionLabel>Notifications</SectionLabel>
        <SettingsRow label="Push notifications" accessory="none"><MonoToggle on /></SettingsRow>
        <div style={{
          padding: "0 20px 14px", borderBottom: "1px solid var(--hairline)",
          fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)",
        }}>Allowed</div>

        <SectionLabel>Home</SectionLabel>
        <div style={{
          padding: "12px 20px 14px", borderBottom: "1px solid var(--hairline)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Open the app to</span>
          <div style={{ display: "flex", gap: 6 }}>
            <Chip active>Today</Chip>
            <Chip>Calendar</Chip>
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </OrbitPhone>
  );
}

function AdvancedScreen({ scheme = "purple", dark = true, isPro = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Advanced" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Widget</SectionLabel>
        <SettingsRow label="Home-screen widget" onTap={() => {}} />

        <SectionLabel>Developers</SectionLabel>
        {isPro ? (
          <>
            {[
              ["Web app", "orb_pk_8b9f…3a2c", "Read-only · Never used · Created May 10"],
              ["Apple Shortcuts", "orb_pk_2417…ff20", "Read · Write · Used May 19"],
            ].map(([title, key, meta]) => (
              <div key={key} style={{
                padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{title}</span>
                  <QuietLink italic>Revoke</QuietLink>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>{key}</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-3)", fontStyle: "italic" }}>{meta}</span>
              </div>
            ))}
            <div style={{ padding: "12px 20px" }}>
              <QuietLink color="var(--fg-1)">+ New key</QuietLink>
            </div>
            <SectionLabel>Connection instructions</SectionLabel>
            <div style={{ padding: "0 20px 8px", display: "flex", gap: 6 }}>
              {["Web","Desktop","Code"].map((t, i) => <Chip key={t} active={i === 2}>{t}</Chip>)}
            </div>
            <div style={{ padding: "8px 20px 20px" }}>
              <div style={{
                padding: "12px 14px", borderRadius: 8,
                background: "var(--bg-sunk)",
                boxShadow: "inset 0 0 0 1px var(--hairline)",
                fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-1)",
                lineHeight: 1.55, position: "relative",
              }}>
                <button style={{
                  position: "absolute", top: 8, right: 10,
                  appearance: "none", border: 0, background: "transparent", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-3)",
                  textDecoration: "underline",
                }}>Copy</button>
                {`curl https://api.orbit.app/v1/habits \\\n  -H "Authorization: Bearer orb_pk_…"`}
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: "14px 20px" }}><LockedBlock /></div>
        )}
      </div>
    </OrbitPhone>
  );
}

function AboutScreen({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="About" subtitle="Version 1.4.2" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SettingsRow label="Feature guide" onTap={() => {}} />
        <SettingsRow label="Referral" value="2 of 5 referred" onTap={() => {}} mono />
        <SettingsRow label="Support" onTap={() => {}} />
        <SettingsRow label="Privacy" onTap={() => {}} />
        <SettingsRow label="Terms" onTap={() => {}} />
        <SettingsRow label="Open-source notices" onTap={() => {}} />
      </div>
    </OrbitPhone>
  );
}

function PrivacyScreen({ scheme = "purple", dark = true }) {
  const sections = [
    ["Intro", "Orbit treats your data as quiet by default. Here's what we keep, why, and how to remove it."],
    ["Data collected", "We store the habits, logs, goals, and notes you enter. Plus your email and a hashed identifier."],
    ["How we use", "To render the app on your devices, sync between them, and produce the reflections you ask for."],
    ["Third parties", "We use a small set: authentication, cloud storage, and Anthropic for chat completions."],
    ["No sell", "We do not sell, rent, or share your data with advertisers or brokers."],
    ["Security", "All data is encrypted in transit and at rest. Local storage uses platform-provided secure enclaves where possible."],
    ["Deletion", "Use Delete account in Profile to remove everything. We honor the request within 30 days."],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Privacy" subtitle="Updated Apr 12, 2026" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {sections.map(([label, body]) => (
          <React.Fragment key={label}>
            <SectionLabel>{label}</SectionLabel>
            <div style={{
              padding: "0 20px 18px",
              fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.6, color: "var(--fg-2)",
            }}>{body}</div>
          </React.Fragment>
        ))}
      </div>
    </OrbitPhone>
  );
}

function SupportScreen({ scheme = "purple", dark = true, sent = false, error }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Support" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px" }}>
        {sent ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0",
          }}>
            <Icon name="check" size={28} strokeWidth={1.8} color="var(--primary)" />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}>Sent.</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", fontStyle: "italic" }}>We'll reply within a day.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <UnderlinedInput label="Name" placeholder="Sam Rivers" />
              <UnderlinedInput label="Email" placeholder="sam@orbit.app" mono />
            </div>
            <UnderlinedInput label="Subject" placeholder="Something I noticed…" />
            <UnderlinedInput label="Message" placeholder="Tell us more…" multiline rows={6} />
            {error && (
              <div style={{
                fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
                color: "var(--status-overdue)",
              }}>{error}</div>
            )}
            <div style={{ marginTop: 12 }}>
              <PrimaryButton fullWidth disabled>Send</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </OrbitPhone>
  );
}

function AISettingsScreen({ scheme = "purple", dark = true, isPro = false }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="AI Settings" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Reflect</SectionLabel>
        <SettingsRow label="Daily reflection prompts" accessory="none"><MonoToggle on /></SettingsRow>
        <div style={{ padding: "0 20px 14px", borderBottom: "1px solid var(--hairline)", fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>On the Today screen and in chat.</div>

        <SectionLabel>Memory</SectionLabel>
        <SettingsRow label="Remember facts you share" accessory="none"><MonoToggle on /></SettingsRow>
        <div style={{ padding: "0 20px 14px", borderBottom: "1px solid var(--hairline)", fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>Orbit remembers a small set of facts you share.</div>

        <SectionLabel>Summary</SectionLabel>
        <SettingsRow label="AI summary on Today" accessory="none"><MonoToggle on={false} /></SettingsRow>
        <div style={{ padding: "0 20px 14px", borderBottom: "1px solid var(--hairline)", fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>A quiet line about today at the top of the screen.</div>

        <SectionLabel trailing={isPro && <span style={{
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)",
          fontVariantNumeric: "tabular-nums",
        }}>1 / 3 · <Icon name="chevron-left" size={12} color="var(--fg-3)" /> <Icon name="chevron-right" size={12} color="var(--fg-3)" /></span>}>
          What Orbit knows
        </SectionLabel>
        {isPro ? (
          <>
            {[
              ["PREFERENCE", "Reads literary fiction in the evenings."],
              ["ROUTINE",    "Runs at 07:00 most weekdays."],
              ["CONTEXT",    "Lives in São Paulo, time zone -03."],
            ].map(([cat, fact]) => (
              <div key={fact} style={{
                padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  letterSpacing: "0.06em", color: "var(--fg-on-primary)",
                  background: "var(--bg-elev)", padding: "2px 6px", borderRadius: 4,
                  alignSelf: "flex-start", boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
                  color: "var(--fg-2)",
                }}>{cat}</span>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{fact}</span>
                  <Icon name="x" size={14} strokeWidth={1.6} color="var(--fg-4)" />
                </div>
              </div>
            ))}
          </>
        ) : (
          <div style={{ padding: "14px 20px" }}><LockedBlock /></div>
        )}
      </div>
    </OrbitPhone>
  );
}

function RetrospectiveScreen({ scheme = "purple", dark = true, state = "content" }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Retrospective" />
      <div style={{
        padding: "10px 20px 14px", display: "flex", gap: 6,
        borderBottom: "1px solid var(--hairline)",
      }}>
        {["Week","Month","Quarter","Semester","Year"].map((p, i) => (
          <Chip key={p} active={i === 1}>{p}</Chip>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {state === "content" && (
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 8, top: 16, bottom: 16,
              width: 2, background: "var(--primary)", borderRadius: 1,
            }} />
            <div style={{
              padding: "16px 20px 8px 22px",
              fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-3)",
              letterSpacing: "0.06em",
              display: "flex", justifyContent: "space-between",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="sparkles" size={11} strokeWidth={1.7} color="var(--primary)" />
                ASTRA · MAY 14
              </span>
              <QuietLink>Regenerate</QuietLink>
            </div>
            <SectionLabel top={14} bottom={6}>What carried</SectionLabel>
            <div style={{ padding: "0 20px 14px 22px", fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.6, color: "var(--fg-2)" }}>
              The morning run held — 28 of 31 days in May. Reading drifted, but the streak survived a single freeze. Meditation reached 47 days. <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>The pattern is steady.</span>
            </div>
            <SectionLabel top={4} bottom={6}>What drifted</SectionLabel>
            <div style={{ padding: "0 20px 14px 22px", fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.6, color: "var(--fg-2)" }}>
              Stretching was the recurring miss — 8 skips, all weekday evenings. Consider shifting to mornings.
            </div>
            <SectionLabel top={4} bottom={6}>A note</SectionLabel>
            <div style={{ padding: "0 20px 28px 22px", fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.6, color: "var(--fg-2)" }}>
              Three Sundays carried every habit. The month closes well.
            </div>
          </div>
        )}
        {state === "generate" && (
          <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)", textAlign: "center" }}>Generate a retrospective for this period.</span>
            <PrimaryButton leading={<Icon name="sparkles" size={14} color="var(--fg-on-primary)" />}>Generate</PrimaryButton>
          </div>
        )}
        {state === "loading" && (
          <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)", textAlign: "center" }}>Drafting…</span>
            <div style={{ width: "60%", height: 7, background: "var(--bg-sunk)", borderRadius: 4 }} />
            <div style={{ width: "80%", height: 7, background: "var(--bg-sunk)", borderRadius: 4 }} />
            <div style={{ width: "40%", height: 7, background: "var(--bg-sunk)", borderRadius: 4 }} />
          </div>
        )}
      </div>
    </OrbitPhone>
  );
}

function CalendarSyncScreen({ scheme = "purple", dark = true, state = "select" }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Calendar Sync" subtitle="Google · Synced May 20" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {state === "disconnected" && (
          <div style={{ padding: "20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)" }}>Connect a Google account to begin.</span>
            <PrimaryButton>Connect Google</PrimaryButton>
          </div>
        )}
        {state === "idle" && (<>
          <SectionLabel>Sync</SectionLabel>
          <SettingsRow label="Auto-sync daily" accessory="none"><MonoToggle on /></SettingsRow>
          <SettingsRow label="Sync now" onTap={() => {}} />
          <SettingsRow label="Disconnect Google" accessory="none">
            <QuietLink italic>Disconnect</QuietLink>
          </SettingsRow>
        </>)}
        {state === "select" && (<>
          <SectionLabel trailing={<><QuietLink color="var(--fg-1)">Select all</QuietLink> &middot; <QuietLink>Clear</QuietLink></>}>4 events</SectionLabel>
          {[
            ["Dentist", "May 24 · 09:00", true],
            ["Apartment viewing", "May 25 · 14:30", true],
            ["Pickup laundry", "May 26 · 18:00", false],
            ["Team offsite", "May 28 · all day", true],
          ].map(([t, m, sel]) => (
            <div key={t} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 20px", borderBottom: "1px solid var(--hairline)",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>{t}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{m}</div>
              </div>
              <SelectCheck selected={sel} />
            </div>
          ))}
          <div style={{ padding: "18px 20px" }}>
            <PrimaryButton fullWidth>Import 3</PrimaryButton>
          </div>
        </>)}
        {state === "importing" && (
          <div style={{ padding: "20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)" }}>Importing 3 events…</span>
            <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "60%", background: "var(--primary)", borderRadius: 999 }} />
            </div>
          </div>
        )}
        {state === "done" && (<>
          <SectionLabel>Imported · 3 events</SectionLabel>
          {["Dentist","Apartment viewing","Team offsite"].map(t => <SettingsRow key={t} label={t} onTap={() => {}} />)}
        </>)}
        {state === "error" && (
          <div style={{ padding: "20px 20px" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--status-overdue)" }}>Couldn't reach Google. Try again.</span>
            <div style={{ marginTop: 14 }}><QuietLink color="var(--fg-1)">Retry</QuietLink></div>
          </div>
        )}
        {state === "offline" && (
          <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <Icon name="wifi-off" size={28} strokeWidth={1.4} color="var(--fg-3)" />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)" }}>Not connected — calendar sync unavailable.</span>
          </div>
        )}
      </div>
    </OrbitPhone>
  );
}

Object.assign(window, {
  PreferencesScreen, AdvancedScreen, AboutScreen, PrivacyScreen,
  SupportScreen, AISettingsScreen, RetrospectiveScreen, CalendarSyncScreen,
});
