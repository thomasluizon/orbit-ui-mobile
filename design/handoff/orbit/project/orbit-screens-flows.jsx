// ============================================================
// Orbit — Login (email + 6-digit code) + Onboarding (7 steps) +
// Calendar import prompt
// ============================================================

function LoginScreen({
  scheme = "purple", dark = true,
  step = 1, email = "sam@orbit.app", code = "", countdown = "0:54",
  error, referral = false,
}) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      {referral && (
        <EdgeBanner>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
            color: "var(--fg-1)", letterSpacing: "0.06em", margin: "0 auto",
          }}>Referral applied · 7 days Pro</span>
        </EdgeBanner>
      )}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        padding: "40px 28px 24px",
      }}>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          paddingBottom: 28,
        }}>
          <div style={{ color: "var(--fg-1)" }}><SaturnDropcap size={32} /></div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 600,
            letterSpacing: "-0.025em", lineHeight: 1, color: "var(--fg-1)",
          }}>Orbit</div>
          <div style={{ width: 60, height: 1, background: "var(--hairline-strong)", marginTop: 6 }} />
        </div>

        <div style={{
          padding: "4px 0 16px", textAlign: "center",
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--fg-3)",
        }}>{step === 1 ? "Sign in" : "Enter code"}</div>

        {error && (
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, fontStyle: "italic",
            color: "var(--status-overdue)", marginBottom: 14, textAlign: "center",
          }}>{error}</div>
        )}

        {step === 1 ? (
          <>
            <UnderlinedInput label="Email" placeholder="you@orbit.app" mono />
            <div style={{ marginTop: 20 }}><PrimaryButton fullWidth>Send code</PrimaryButton></div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "24px 0 16px" }}>
              <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
                letterSpacing: "0.06em",
              }}>or</span>
              <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
            </div>
            <SecondaryButton fullWidth>Continue with Google</SecondaryButton>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 12, lineHeight: 1.5,
              color: "var(--fg-3)", textAlign: "center", marginTop: 24, fontStyle: "italic",
            }}>
              By signing in you agree to the <span style={{ textDecoration: "underline" }}>Terms</span> and <span style={{ textDecoration: "underline" }}>Privacy</span>.
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.5,
              color: "var(--fg-3)", textAlign: "center", marginBottom: 16, fontStyle: "italic",
            }}>We sent a 6-digit code to {email}.</div>
            <CodeInput value={code} />
            <div style={{ marginTop: 18 }}><PrimaryButton fullWidth>Verify</PrimaryButton></div>
            <div style={{
              display: "flex", justifyContent: "center", marginTop: 16,
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--fg-3)",
              fontVariantNumeric: "tabular-nums",
            }}>{countdown ? <>Resend in {countdown}</> : <QuietLink color="var(--fg-1)">Resend code</QuietLink>}</div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <QuietLink>Change email</QuietLink>
            </div>
          </>
        )}
      </div>
    </OrbitPhone>
  );
}

// ─── ONBOARDING — 7 steps ───────────────────────────────────
function OnboardingStep({ scheme = "purple", dark = true, step = 1 }) {
  const total = 7;
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 20px",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
          color: "var(--fg-3)", letterSpacing: "0.04em",
          fontVariantNumeric: "tabular-nums",
        }}>Orbit · <span style={{ color: "var(--fg-1)" }}>{String(step).padStart(2,"0")}</span> / {String(total).padStart(2,"0")}</div>
        {step < total && <button style={{
          appearance: "none", border: 0, background: "transparent", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)", padding: 0,
        }}>Skip</button>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 28px" }}>
        {step === 1 && <Onb1Welcome />}
        {step === 2 && <Onb2Astra />}
        {step === 3 && <Onb3CreateHabit />}
        {step === 4 && <Onb4Complete />}
        {step === 5 && <Onb5Goal />}
        {step === 6 && <Onb6Features />}
        {step === 7 && <Onb7Done />}
      </div>

      <div style={{ padding: "12px 22px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <ProgressDots active={step - 1} total={total} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12 }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            {step > 1 && <QuietLink>Back</QuietLink>}
          </div>
          <div style={{ flex: 2 }}>
            <PrimaryButton fullWidth>{step === total ? "Finish" : step === 1 ? "Begin" : "Continue"}</PrimaryButton>
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </div>
    </OrbitPhone>
  );
}

function Onb1Welcome() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "16px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 14 }}>
        <div style={{ color: "var(--fg-1)" }}><SaturnDropcap size={48} /></div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 600,
          letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--fg-1)", textAlign: "center",
        }}>Track habits.<br/>Talk to Astra.<br/>Look at the long arc.</div>
      </div>
      <SectionLabel top={12}>Week starts on</SectionLabel>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
        {["S","M","T","W","T","F","S"].map((d, i) => <Chip key={i} active={i === 1}>{d}</Chip>)}
      </div>
      <SectionLabel top={12}>Pick a scheme</SectionLabel>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <SchemeSwatches active="purple" lockNonDefault />
      </div>
    </div>
  );
}

function Onb2Astra() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, padding: "32px 0" }}>
      <div style={{
        width: 92, height: 92, position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          position: "absolute", inset: 0, borderRadius: 999,
          boxShadow: "inset 0 0 0 1.5px var(--primary)",
          animation: "orbit-rotate 3.6s linear infinite",
        }} />
        <Icon name="sparkles" size={32} strokeWidth={1.4} color="var(--fg-1)" />
      </div>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 600,
        letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--fg-1)", textAlign: "center",
      }}>Meet Astra.</div>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)",
        textAlign: "center", maxWidth: 300, lineHeight: 1.5,
      }}>Orbit's assistant. It can create habits, recap your day, plan ahead, and reflect on what's drifting. Ask plainly. It listens.</div>
    </div>
  );
}

function Onb3CreateHabit() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 0" }}>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.15, color: "var(--fg-1)", textAlign: "center",
      }}>Tell Astra what to track.</div>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)",
        textAlign: "center", lineHeight: 1.5,
      }}>Type plainly — "read 20 min daily at 9pm" — or pick a starter.</div>
      <UnderlinedInput placeholder="What do you want to track?" large />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Chip leading={<Icon name="settings-2" size={11} color="var(--fg-2)" />}>Use a form instead</Chip>
      </div>
      <SectionLabel top={8}>Starters</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["Read 20 min", "Walk 5,000 steps", "Drink water", "Stretch"].map(s => <Chip key={s}>{s}</Chip>)}
      </div>
    </div>
  );
}

function Onb4Complete() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "16px 0" }}>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.15, color: "var(--fg-1)", textAlign: "center",
      }}>Try it. Tap the dot.</div>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)",
        textAlign: "center", lineHeight: 1.5,
      }}>This is the whole ritual.</div>
      <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 8 }}>
        <HabitRow habit={{ name: "Read 20 minutes", frequency: "Daily", dueTime: "21:00", state: "empty" }} />
      </div>
    </div>
  );
}

function Onb5Goal() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 0" }}>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
        <ProTag>Pro · Optional</ProTag>
      </div>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.15, color: "var(--fg-1)", textAlign: "center",
      }}>Add a longer arc.</div>
      <UnderlinedInput placeholder="Goal title" large />
      <div style={{ display: "flex", gap: 12 }}>
        <UnderlinedInput placeholder="Target" mono />
        <UnderlinedInput placeholder="Unit" />
      </div>
      <SectionLabel top={4}>Starters</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["Read 12 books", "Run 200 km", "Save $5,000"].map(s => <Chip key={s}>{s}</Chip>)}
      </div>
    </div>
  );
}

function Onb6Features() {
  const rows = [
    ["Chat",         "Talk through the day with Astra.", "sparkles"],
    ["Sub-habits",   "Break a habit into smaller pieces. Pro.", "list-tree"],
    ["Calendar",     "Look at every day at a glance.", "calendar-days"],
    ["Achievements", "A loose ledger of milestones.", "trophy"],
    ["Notifications","Gentle nudges at the times you set.", "bell"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 0" }}>
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
        letterSpacing: "-0.015em", lineHeight: 1.15, color: "var(--fg-1)",
        textAlign: "center", marginBottom: 14,
      }}>What else Orbit does.</div>
      {rows.map(([label, desc, icon]) => (
        <div key={label} style={{
          padding: "12px 0", borderBottom: "1px solid var(--hairline)",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <Icon name={icon} size={18} strokeWidth={1.5} color="var(--fg-2)" />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--fg-1)",
            }}>{label}</div>
            <div style={{
              fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-3)",
              marginTop: 2, fontStyle: "italic",
            }}>{desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Onb7Done() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "12px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 999, background: "var(--primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
            stroke="var(--fg-on-primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 600,
          letterSpacing: "-0.02em", color: "var(--fg-1)", textAlign: "center",
        }}>You're set.</div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)",
          textAlign: "center", maxWidth: 280, lineHeight: 1.5,
        }}>Come back tomorrow and tap one dot.</div>
      </div>
      <div>
        {["Created your first habit", "Picked a color", "Met Astra"].map(it => (
          <div key={it} style={{
            padding: "11px 0", borderBottom: "1px solid var(--hairline)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{it}</span>
            <Icon name="check" size={15} strokeWidth={1.8} color="var(--primary)" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarImportPrompt({ scheme = "purple", dark = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      <div style={{ flex: 1, opacity: 0.4, pointerEvents: "none" }}>
        <AppBar leadingIcon="sun" title="Today" subtitle="Thu · May 21" />
      </div>
      <BottomSheet heightPct={50}>
        <div style={{ padding: "10px 24px 0", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
            textAlign: "center",
          }}>One last thing</div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 600,
            color: "var(--fg-1)", letterSpacing: "-0.015em",
          }}>Import your calendar?</div>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55,
          }}>Bring scheduled events into Orbit as one-time tasks. You can change this later.</div>
          <div style={{ flex: 1 }} />
          <PrimaryButton fullWidth>Connect Google Calendar</PrimaryButton>
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 18px" }}>
            <QuietLink>Not now</QuietLink>
          </div>
        </div>
      </BottomSheet>
    </OrbitPhone>
  );
}

Object.assign(window, {
  LoginScreen, OnboardingStep, CalendarImportPrompt,
});
