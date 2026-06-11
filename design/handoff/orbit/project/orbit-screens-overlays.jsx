// ============================================================
// Orbit — Overlays: modals · drawers · toasts · celebrations · banners
// ============================================================

function ModalBg() {
  return (
    <>
      <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21"
        trailing={<UtilityCluster dark streak={47} />} />
      <SectionLabel>Habits</SectionLabel>
    </>
  );
}

// ─── Notifications sheet ────────────────────────────────────
function NotificationsSheet({ scheme = "purple", dark = true }) {
  const items = [
    [true, "Streak milestone", "Forty-seven days. Steady hand.", "2h"],
    [true, "Reflection", "How did the day land?", "4h"],
    [false, "Reading 30 min", "Reminder · 21:00", "Yesterday"],
    [false, "Pay rent", "Due in 5 days", "May 18"],
    [false, "Weekly review", "Sunday at 18:00", "May 12"],
  ];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}><ModalBg /></div>
      <BottomSheet heightPct={92}>
        <div style={{
          padding: "10px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: "1px solid var(--hairline)",
        }}>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600, color: "var(--fg-1)",
          }}>Inbox</span>
          <div style={{ display: "flex", gap: 16 }}>
            <QuietLink color="var(--fg-1)">Mark all read</QuietLink>
            <QuietLink italic>Delete all</QuietLink>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {items.map(([unread, title, body, time], i) => (
            <div key={i} style={{
              padding: "13px 20px", borderBottom: "1px solid var(--hairline)",
              display: "flex", gap: 10,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: unread ? "var(--primary)" : "transparent",
                marginTop: 7, flexShrink: 0,
              }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)", fontWeight: unread ? 500 : 400 }}>{title}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", flexShrink: 0 }}>{time}</span>
                </div>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", lineHeight: 1.45 }}>{body}</span>
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Fresh Start (2-step) ───────────────────────────────────
function FreshStartModal({ scheme = "purple", dark = true, step = 1 }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, padding: "20px 24px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>
          {step === 1 ? "Fresh start" : "Type to confirm"}
        </div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 600,
          color: "var(--fg-1)", letterSpacing: "-0.02em", lineHeight: 1.15,
        }}>{step === 1 ? "Reset everything?" : "Type ORBIT to confirm."}</div>
        {step === 1 ? (<>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55 }}>
            Deletes habits, goals, logs, and tags. Keeps your account, subscription, and color scheme.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 6 }}>
            <ListBlock title="Will delete" items={["Habits","Goals","Logs","Tags","Notifications","Achievements"]} />
            <ListBlock title="Will keep"   items={["Account","Subscription","Schemes","Preferences"]} />
          </div>
        </>) : (<>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)" }}>This action can't be undone.</div>
          <UnderlinedInput placeholder="ORBIT" mono large />
        </>)}
      </div>
      <div style={{
        padding: "14px 22px 22px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid var(--hairline)",
      }}>
        <QuietLink>{step === 1 ? "Cancel" : "Back"}</QuietLink>
        {step === 1 ? <PrimaryButton>Continue</PrimaryButton>
          : <QuietLink color="var(--fg-1)" italic>Reset</QuietLink>}
      </div>
    </OrbitPhone>
  );
}

function ListBlock({ title, items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map(it => (
          <span key={it} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-1)" }}>{it}</span>
        ))}
      </div>
    </div>
  );
}

function DeleteAccountModal({ scheme = "purple", dark = true, step = 1 }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, padding: "20px 24px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>
          {step === 1 ? "Delete account" : step === 2 ? "Verify" : "Deactivated"}
        </div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 600,
          color: "var(--fg-1)", letterSpacing: "-0.02em", lineHeight: 1.15,
        }}>
          {step === 1 ? "Are you sure?" : step === 2 ? "Confirm with code" : "Account scheduled for deletion."}
        </div>
        {step === 1 && (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55 }}>Deletes everything Orbit has about you. Final after a 14-day deactivation.</div>
        )}
        {step === 2 && (<>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-3)", lineHeight: 1.55 }}>We sent a 6-digit code to sam@orbit.app.</div>
          <CodeInput value="" />
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
          }}>Resend in 0:54</div>
        </>)}
        {step === 3 && (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55 }}>Your account will be deleted on June 4, 2026. Sign in before then to cancel.</div>
        )}
      </div>
      <div style={{
        padding: "14px 22px 22px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid var(--hairline)",
      }}>
        {step < 3 ? <QuietLink>{step === 1 ? "Cancel" : "Back"}</QuietLink> : <span />}
        {step === 1 && <PrimaryButton>Continue</PrimaryButton>}
        {step === 2 && <QuietLink color="var(--fg-1)" italic>Verify</QuietLink>}
        {step === 3 && <PrimaryButton>Sign out</PrimaryButton>}
      </div>
    </OrbitPhone>
  );
}

function ReferralDrawer({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}><ModalBg /></div>
      <BottomSheet heightPct={72}>
        <div style={{ padding: "10px 20px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>Referral</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600, color: "var(--fg-1)", letterSpacing: "-0.015em" }}>Bring a friend</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55 }}>Five referrals earns one month free.</div>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 0 12px", borderBottom: "1px solid var(--hairline)",
          }}>
            <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>orbit.app/r/sam-rivers</span>
            <QuietLink color="var(--fg-1)">Copy</QuietLink>
            <QuietLink color="var(--fg-1)">Share</QuietLink>
          </div>
          <div style={{
            padding: "6px 0",
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
            display: "flex", justifyContent: "space-between", fontVariantNumeric: "tabular-nums",
          }}>
            <span>Completed · <span style={{ color: "var(--fg-1)" }}>2</span></span>
            <span>Pending · <span style={{ color: "var(--fg-1)" }}>1</span></span>
            <span>Coupons · <span style={{ color: "var(--fg-1)" }}>0</span></span>
          </div>
          <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "40%", background: "var(--primary)", borderRadius: 999 }} />
          </div>
          <div style={{ paddingTop: 14, fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.65 }}>
            Share your link. Friends sign up and earn 7 days Pro free. Each referral that becomes Pro adds one month to your subscription, up to twelve a year.
          </div>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

function FeatureGuideDrawer({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}><ModalBg /></div>
      <BottomSheet heightPct={94}>
        <div style={{ padding: "10px 20px 0" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>Feature guide</div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600, color: "var(--fg-1)",
            letterSpacing: "-0.015em", marginTop: 6, marginBottom: 12,
          }}>What Orbit can do</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10, borderBottom: "1px solid var(--hairline)" }}>
            {["Habits","Goals","Chat","Calendar","Settings","Notifications"].map((t, i) => (
              <Chip key={t} active={i === 0}>{t}</Chip>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {[
            ["Create habits", "Daily, weekly, monthly, yearly, or one-time."],
            ["Sub-habits · Pro", "Break a parent into named children."],
            ["Checklist habits", "Multi-step habits with reset on each period."],
            ["Bad habits", "Track avoidance instead of completion."],
            ["Tags", "Loose grouping. Filter by tag on Today."],
            ["Reminders", "At time, or X before. Daily reminder by default."],
            ["Streak freeze", "Bank up to five freezes. Use to bridge a missed day."],
            ["Linked goals · Pro", "Connect a habit to a longer arc."],
            ["Force-log", "Mark a parent done even if children are empty."],
            ["Move habit between parents", "Restructure as you learn what holds."],
            ["Duplicate habit", "Quick fork for variants."],
            ["Bulk actions", "Select mode to log, skip, or delete in one pass."],
            ["Description viewer", "Long-form context behind a quiet tap."],
            ["Mini month grid", "See the last month at a glance."],
            ["Recent logs", "Five most recent entries with timestamps."],
          ].map(([t, d]) => (
            <div key={t} style={{
              padding: "11px 20px", borderBottom: "1px solid var(--hairline)",
              display: "flex", flexDirection: "column", gap: 2,
            }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>{t}</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)" }}>{d}</span>
            </div>
          ))}
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

function TrialExpiredModal({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, padding: "32px 28px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>Trial ended</div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 600,
          color: "var(--fg-1)", letterSpacing: "-0.025em", lineHeight: 1.15,
        }}>Welcome back to free.</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55 }}>
          You can keep using Orbit forever. Pro features pause until you subscribe.
        </div>
        <div style={{ marginTop: 14 }}>
          {["Sub-habits","AI chat","Goals","AI summary","All schemes"].map(label => (
            <div key={label} style={{
              padding: "11px 0", borderBottom: "1px solid var(--hairline)",
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)", fontStyle: "italic" }}>Paused</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "18px 28px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
        <PrimaryButton fullWidth>Subscribe</PrimaryButton>
        <div style={{ display: "flex", justifyContent: "center" }}><QuietLink>Continue free</QuietLink></div>
      </div>
    </OrbitPhone>
  );
}

function PushPrompt({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, pointerEvents: "none", opacity: 0.6 }}><ModalBg /></div>
      <div style={{
        borderTop: "1px solid var(--hairline)",
        background: "var(--bg-elev)",
        padding: "14px 20px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>Permissions</span>
          <button style={{ appearance: "none", border: 0, background: "transparent", cursor: "pointer", padding: 0, color: "var(--fg-3)" }}>
            <Icon name="x" size={14} strokeWidth={1.6} />
          </button>
        </div>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}>Get a gentle daily nudge?</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-3)", lineHeight: 1.5 }}>One reminder a day. We won't badge.</span>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 22, paddingTop: 4 }}>
          <QuietLink>Later</QuietLink>
          <QuietLink color="var(--fg-1)">Enable</QuietLink>
        </div>
      </div>
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

function VersionUpdateDrawer({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}><ModalBg /></div>
      <BottomSheet heightPct={54}>
        <div style={{ padding: "10px 22px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>Update available</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600, color: "var(--fg-1)", letterSpacing: "-0.015em" }}>Orbit 1.5.0</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>1.4.2 → 1.5.0</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)", lineHeight: 1.55, marginTop: 6 }}>
            A quieter Today header. A new Goals view. Bulk bar no longer covers the FAB.
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 12 }}>
            <PrimaryButton fullWidth>Update now</PrimaryButton>
            <div style={{ display: "flex", justifyContent: "center" }}><QuietLink>Later</QuietLink></div>
          </div>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

function ApiKeyModal({ scheme = "purple", dark = true, step = 1 }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}><ModalBg /></div>
      <BottomSheet heightPct={84}>
        <div style={{ padding: "10px 20px 0", flex: 1, overflowY: "auto" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)", marginBottom: 12 }}>
            {step === 1 ? "New key" : "One-time reveal"}
          </div>
          {step === 1 ? (<>
            <UnderlinedInput placeholder="Key name" large />
            <SectionLabel top={18} bottom={8}>Scopes</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 12 }}>
              {[["habits.read", true],["habits.write", true],["goals.read", true],["goals.write", false],["logs.read", false],["logs.write", false]].map(([s, active]) => (
                <Chip key={s} active={active}>{s}</Chip>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1px solid var(--hairline)" }}>
              <QuietLink color="var(--fg-1)">Select all</QuietLink>
              <QuietLink>Clear</QuietLink>
            </div>
            <SettingsRow label="Read-only" accessory="none"><MonoToggle on={false} /></SettingsRow>
            <SettingsRow label="Expires" value="Never" mono onTap={() => {}} />
          </>) : (<>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--status-overdue)", marginBottom: 12 }}>
              Copy now. You won't see this again.
            </div>
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "var(--bg-sunk)",
              boxShadow: "inset 0 0 0 1px var(--hairline)",
              fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-1)",
              lineHeight: 1.5, position: "relative", wordBreak: "break-all", marginBottom: 12,
            }}>
              <button style={{
                position: "absolute", top: 8, right: 10,
                appearance: "none", border: 0, background: "transparent", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-3)",
                textDecoration: "underline",
              }}>Copy</button>
              orb_pk_8b9fcd47ab2f31e7c5d8e2f4a36b9c1d
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)" }}>Scopes · 3 · Read-only · Never expires</div>
          </>)}
        </div>
        <div style={{
          padding: "12px 20px 18px", borderTop: "1px solid var(--hairline)",
          display: "flex", justifyContent: "space-between",
        }}>
          {step === 1 ? <QuietLink>Cancel</QuietLink> : <span />}
          {step === 1 ? <PrimaryButton>Create key</PrimaryButton> : <QuietLink color="var(--fg-1)">Done</QuietLink>}
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

// ─── Confirm dialogs ────────────────────────────────────────
function ConfirmFrame({ scheme = "purple", dark = true, variant }) {
  const variants = {
    delete:     { eyebrow: "Delete", title: "Delete habit?", body: "This removes 47 days of history.", action: "Delete habit", destructive: true },
    bulkDelete: { eyebrow: "Delete", title: "Delete three habits?", body: "Deletes three habits and their history.", action: "Delete habits", destructive: true },
    bulkLog:    { eyebrow: "Bulk log", title: "Log three habits as done?", body: "Marks three habits complete for today.", action: "Log all" },
    bulkSkip:   { eyebrow: "Bulk skip", title: "Skip three habits?", body: "Marks three habits as skipped for today.", action: "Skip all" },
    signOut:    { eyebrow: "Sign out", title: "Sign out of Orbit?", body: "You can sign back in any time.", action: "Sign out" },
    forceLog:   { eyebrow: "Confirm", title: "Log Morning routine anyway?", body: "Two children are still empty.", action: "Log parent" },
    moveParent: { eyebrow: "Move habit", title: "Move Spanish under…", action: "Move",
      list: ["None (top-level)","Languages","Morning routine","Evening wind-down"] },
  };
  const v = variants[variant];
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1 }}><ModalBg /></div>
      <Scrim>
        <ConfirmDialog eyebrow={v.eyebrow} title={v.title} body={v.body}
          actionLabel={v.action} destructive={v.destructive}>
          {v.list && (
            <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 6 }}>
              {v.list.map((item, i) => (
                <div key={i} style={{
                  padding: "9px 0", borderBottom: i < v.list.length - 1 ? "1px solid var(--hairline)" : "none",
                  fontFamily: "var(--font-sans)", fontSize: 14,
                  color: i === 1 ? "var(--fg-1)" : "var(--fg-2)",
                  fontWeight: i === 1 ? 500 : 400,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  {item}
                  {i === 1 && <Icon name="check" size={14} strokeWidth={1.8} color="var(--primary)" />}
                </div>
              ))}
            </div>
          )}
        </ConfirmDialog>
      </Scrim>
    </OrbitPhone>
  );
}

// ─── Toast frames ───────────────────────────────────────────
function ToastFrame({ scheme = "purple", dark = true, kind = "success" }) {
  const map = {
    success: { eyebrow: "Created", title: "Read 30 minutes", body: "Daily · 21:00 · Reading", actionLabel: "View" },
    error:   { eyebrow: "Couldn't save", title: "Connection issue", body: "We'll retry when you're back online.", actionLabel: "Retry" },
    info:    { eyebrow: "Heads up", title: "Today's chat is at the daily limit.", body: "Watch an ad or wait until tomorrow.", actionLabel: "Watch" },
    queued:  { eyebrow: "Deleted", title: "Late-night screen", body: "Undo within 15 seconds.", actionLabel: "Undo" },
  };
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <ModalBg />
      <div style={{ flex: 1 }} />
      <BottomNav active="today" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 56 }}>
        <Toast kind={kind} {...map[kind]} />
      </div>
    </OrbitPhone>
  );
}

// ─── Celebrations · unified Saturn-ring motif ──────────────
function Celebration({ scheme = "purple", dark = true, kind = "all-done" }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <ModalBg />
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32, color: "white",
      }}>
        {kind === "all-done" && (
          <RingMotif anchor={
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500,
              color: "white", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em",
            }}>Done · 6 / 6</span>
          } body="The day is closed." ringCount={3} />
        )}
        {kind === "streak" && (
          <RingMotif eyebrow="Streak" anchor={
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 96, fontWeight: 500,
              color: "white", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
              lineHeight: 0.9,
            }}>47</span>
          } body="Forty-seven days." ringCount={4} ringSize={180} />
        )}
        {kind === "freeze" && (
          <RingMotif eyebrow="Frozen · May 21" eyebrowColor="var(--status-frozen)" anchor={
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 64, fontWeight: 500,
              color: "white", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
            }}>47</span>
          } body="Your streak holds." ringCount={3}
            ringColor="var(--status-frozen)" dashed />
        )}
        {kind === "goal" && (
          <RingMotif anchor={
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500,
              color: "white", letterSpacing: "0.10em", textTransform: "uppercase",
            }}>Goal · Read 12 books</span>
          } body="Filed." ringCount={4} ringSize={130} />
        )}
        {kind === "level" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
              color: "rgba(255,255,255,0.7)", letterSpacing: "0.18em", textTransform: "uppercase",
            }}>Level up</div>
            <div style={{ position: "relative", width: 130, height: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="130" height="130" style={{
                position: "absolute", inset: 0,
                animation: "orbit-rotate 8s linear infinite",
                transform: "rotate(-18deg)",
              }}>
                <ellipse cx="65" cy="65" rx="62" ry="22"
                  fill="none" stroke="var(--primary)" strokeWidth="1.5" />
              </svg>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 80, fontWeight: 500,
                color: "white", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em",
              }}>08</span>
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontStyle: "italic", color: "rgba(255,255,255,0.85)" }}>Steady hand.</div>
          </div>
        )}
        {kind === "achievement" && (
          <div style={{ position: "absolute", top: 56, left: 0, right: 0 }}>
            <div style={{
              margin: "18px auto 0", maxWidth: 380,
              background: "var(--bg-elev)",
              borderRadius: 10, padding: "12px 14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" style={{ position: "absolute", inset: 0 }}>
                  <circle cx="16" cy="16" r="14" fill="none" stroke="var(--primary)" strokeWidth="1" />
                </svg>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--fg-1)" }}>◆</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
                  color: "var(--fg-3)", letterSpacing: "0.12em", textTransform: "uppercase",
                }}>Achievement · Rare · +50 XP</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Steady hand</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)" }}>47-day streak.</span>
              </div>
            </div>
          </div>
        )}
        {kind === "welcome" && (
          <div style={{ position: "absolute", top: 56, left: 0, right: 0 }}>
            <div style={{
              margin: "18px auto 0", maxWidth: 380,
              background: "var(--bg-elev)",
              borderRadius: 10, padding: "14px 16px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)",
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
                  color: "var(--fg-3)", letterSpacing: "0.12em", textTransform: "uppercase",
                }}>Welcome back</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic", color: "var(--fg-2)" }}>Your forty-seven-day streak is still alive.</span>
              </div>
              <svg width="24" height="24" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--primary)" strokeWidth="1" />
              </svg>
            </div>
          </div>
        )}
      </div>
    </OrbitPhone>
  );
}

// Saturn-ring motif: anchor + concentric expanding hairline rings
function RingMotif({ anchor, body, eyebrow, eyebrowColor, ringCount = 3, ringSize = 280, ringColor, dashed }) {
  const color = ringColor || "var(--primary)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        {Array.from({ length: ringCount }).map((_, i) => {
          const size = ringSize * (i + 1) / ringCount;
          return (
            <span key={i} style={{
              position: "absolute", width: size, height: size, borderRadius: 999,
              border: `1px ${dashed ? "dashed" : "solid"} ${color}`,
              opacity: i === 0 ? 0.85 : (1 - i / ringCount) * 0.6,
            }} />
          );
        })}
      </div>
      {eyebrow && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          color: eyebrowColor || "rgba(255,255,255,0.7)",
          letterSpacing: "0.18em", textTransform: "uppercase",
          zIndex: 1,
        }}>{eyebrow}</div>
      )}
      <div style={{ zIndex: 1 }}>{anchor}</div>
      {body && (
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontStyle: "italic", color: "rgba(255,255,255,0.85)", zIndex: 1 }}>{body}</div>
      )}
    </div>
  );
}

// ─── Tour overlay ───────────────────────────────────────────
function TourOverlay({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21"
        trailing={<UtilityCluster dark streak={47} />} />
      <SectionLabel>Habits</SectionLabel>
      <UtilityRow tags={[]} />
      <div style={{ flex: 1, position: "relative" }}>
        <HabitRow habit={DEFAULT_HABITS[0]} />
        <HabitRow habit={DEFAULT_HABITS[1]} />
        <HabitRow habit={DEFAULT_HABITS[2]} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.60)", pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: 6, left: 8, right: 8, height: 56,
            borderRadius: 6, boxShadow: "0 0 0 1.5px white",
            mixBlendMode: "destination-out",
          }} />
        </div>
        <div style={{
          position: "absolute", top: 80, left: 18, right: 18,
          background: "var(--bg-elev)", borderRadius: 10,
          padding: 14, boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--fg-3)" }}>Tour · 4 of 23</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--fg-1)" }}>Tap the dot to log.</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic", color: "var(--fg-2)" }}>Single tap marks the row done. The streak number updates immediately.</span>
          <div style={{ height: 3, background: "var(--bg-sunk)", borderRadius: 999, position: "relative", marginTop: 4 }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(4/23*100)}%`, background: "var(--primary)", borderRadius: 999 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <QuietLink>Previous</QuietLink>
            <QuietLink>Skip</QuietLink>
            <QuietLink color="var(--fg-1)">Next</QuietLink>
          </div>
        </div>
      </div>
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

function BannerSpecimen({ scheme = "purple", dark = true, variant = "trial" }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      {variant === "trial" && (
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>Trial · <span style={{ color: "var(--fg-1)" }}>4 days left</span></span>
          <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
        </EdgeBanner>
      )}
      {variant === "trialUrgent" && (
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>Trial · <span style={{ color: "var(--status-overdue)", fontStyle: "italic" }}>Last day</span></span>
          <QuietLink color="var(--fg-1)">Upgrade</QuietLink>
        </EdgeBanner>
      )}
      {variant === "review" && (
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-1)" }}>Enjoying Orbit? A rating would help.</span>
          <span style={{ display: "flex", gap: 14 }}><QuietLink color="var(--fg-1)">Rate</QuietLink><QuietLink>Later</QuietLink></span>
        </EdgeBanner>
      )}
      {variant === "expiry" && (
        <EdgeBanner>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>Session expiring in <span style={{ color: "var(--fg-1)", fontFamily: "var(--font-mono)" }}>4 min</span></span>
          <QuietLink color="var(--fg-1)">Refresh</QuietLink>
        </EdgeBanner>
      )}
      {variant === "referral" && (
        <EdgeBanner>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--fg-1)",
            letterSpacing: "0.06em", margin: "0 auto",
          }}>Referral applied · 7 days Pro</span>
        </EdgeBanner>
      )}
      <ModalBg />
      <div style={{ flex: 1 }} />
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

// ─── Shared components appendix ─────────────────────────────
function ComponentAppendix({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar back title="Specimens" subtitle="Shared components" />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionLabel>Status dots</SectionLabel>
        <div style={{ padding: "16px 20px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          {[["done","Done"],["empty","Empty"],["skip","Skip"],["overdue","Overdue"],["bad","Bad"],["frozen","Frozen"]].map(([s, l]) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <StatusDot state={s} size={10} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--fg-3)" }}>{l}</span>
            </div>
          ))}
        </div>
        <SectionLabel>Habit row states</SectionLabel>
        <HabitRow habit={DEFAULT_HABITS[0]} />
        <HabitRow habit={DEFAULT_HABITS[2]} />
        <HabitRow habit={DEFAULT_HABITS[4]} />
        <HabitRow habit={{ name: "Late-night screen", frequency: "Daily", state: "empty", bad: true, streak: 12 }} />
        <HabitRow habit={{ name: "Languages", frequency: "Daily", hasChildren: true, childProgress: { done: 2, total: 3 }, state: "empty" }} />
        <HabitRow habit={{ name: "Spanish", frequency: "Daily", state: "done", streak: 41 }} child indent={16} />
        <SkeletonRow />
        <SectionLabel>Chips</SectionLabel>
        <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip>Default</Chip>
          <Chip active>Active</Chip>
          <TagChip tag={{name: "Reading", color: "#9a6d8c"}} active />
          <TagChip tag={{name: "Health", color: "#6d9a78"}} />
        </div>
        <SectionLabel>Sheet handle</SectionLabel>
        <div style={{ padding: "16px 20px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: 32, height: 3, borderRadius: 999, background: "var(--hairline-strong)" }} />
        </div>
      </div>
    </OrbitPhone>
  );
}

function BottomNavSpecimen({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <AppBar title="Tab bar specimen" />
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.5 }}>
          Home · Chat · [FAB Sparkles] · Calendar · You. Active tab marks the icon with a 2px primary line above. The FAB opens the Quick Sheet.
        </span>
      </div>
      <BottomNav active="today" />
    </OrbitPhone>
  );
}

Object.assign(window, {
  NotificationsSheet, FreshStartModal, DeleteAccountModal,
  ReferralDrawer, FeatureGuideDrawer, TrialExpiredModal,
  PushPrompt, VersionUpdateDrawer, ApiKeyModal,
  ConfirmFrame, ToastFrame, Celebration, TourOverlay,
  BannerSpecimen, ComponentAppendix, BottomNavSpecimen, ModalBg,
});
