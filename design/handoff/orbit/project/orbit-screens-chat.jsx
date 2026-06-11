// ============================================================
// Orbit — Chat (Astra) screen — the headline tab
// ============================================================

function ChatShell({ scheme = "purple", dark = true, children, inputState = "default", showAppBar = true }) {
  return (
    <OrbitPhone scheme={scheme} dark={dark}>
      {showAppBar && (
        <AppBar leadingIcon="sparkles" title="Chat"
          trailing={
            <>
              <button aria-label="More" style={iconBtn}>
                <Icon name="more-horizontal" size={17} strokeWidth={1.5} color="var(--fg-2)" />
              </button>
            </>
          }
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      <ChatInput state={inputState} />
      <BottomNav active="chat" />
    </OrbitPhone>
  );
}

function ChatInput({ state = "default" }) {
  if (state === "voice") {
    return (
      <div style={{
        borderTop: "1px solid var(--hairline)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--status-bad)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
          {[14, 22, 10, 18, 14, 24, 12, 16, 10, 20, 14].map((h, i) => (
            <span key={i} style={{
              width: 3, height: h, background: "var(--fg-2)", borderRadius: 1,
            }} />
          ))}
        </div>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
          color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
        }}>00:42</span>
        <button style={{
          appearance: "none", border: 0, cursor: "pointer",
          width: 32, height: 32, borderRadius: 8, background: "var(--fg-1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ width: 11, height: 11, background: "var(--bg)", borderRadius: 2 }} />
        </button>
      </div>
    );
  }
  if (state === "offline") {
    return (
      <div style={{
        borderTop: "1px solid var(--hairline)",
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        <Icon name="wifi-off" size={15} strokeWidth={1.6} color="var(--fg-3)" />
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic",
          color: "var(--fg-2)",
        }}>Not connected — chat unavailable while offline.</span>
      </div>
    );
  }
  return (
    <div style={{
      borderTop: "1px solid var(--hairline)",
      padding: "10px 12px 10px 20px",
      display: "flex", alignItems: "center", gap: 8,
      flexShrink: 0,
    }}>
      <input placeholder="Ask Astra" style={{
        flex: 1, minWidth: 0,
        appearance: "none", border: 0, background: "transparent", outline: "none",
        fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)",
      }} />
      <button aria-label="Image" style={iconBtn}>
        <Icon name="image" size={17} strokeWidth={1.5} color="var(--fg-3)" />
      </button>
      <button aria-label="Mic" style={iconBtn}>
        <Icon name="mic" size={17} strokeWidth={1.5} color="var(--fg-3)" />
      </button>
      <button aria-label="Send" style={{
        appearance: "none", border: 0, cursor: "pointer",
        width: 32, height: 32, borderRadius: 999, background: "var(--primary)",
        color: "var(--fg-on-primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}

// ─── Message turns ──────────────────────────────────────────
function UserTurn({ time, children, image }) {
  return (
    <div style={{
      padding: "14px 20px",
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
        color: "var(--fg-3)", letterSpacing: "0.04em",
      }}>{time}</span>
      {image && (
        <div style={{
          width: 200, height: 144,
          background: "var(--bg-sunk)",
          boxShadow: "inset 0 0 0 1px var(--hairline)",
          borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--fg-4)",
          fontFamily: "var(--font-mono)", fontSize: 11,
        }}>Image</div>
      )}
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)",
        lineHeight: 1.5, textAlign: "right", maxWidth: "84%",
      }}>{children}</span>
    </div>
  );
}

function AstraTurn({ time, children, attribution = true }) {
  return (
    <div style={{ padding: "14px 20px" }}>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4,
          width: 2, background: "var(--primary)", borderRadius: 1,
        }} />
        {attribution && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
            color: "var(--fg-3)", letterSpacing: "0.06em", marginBottom: 6,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <Icon name="sparkles" size={11} strokeWidth={1.7} color="var(--primary)" />
            ASTRA · {time}
          </div>
        )}
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 15, fontStyle: "italic",
          color: "var(--fg-2)", lineHeight: 1.5,
        }}>{children}</div>
      </div>
    </div>
  );
}

function ChatCard({ eyebrow, title, body, footer, severity }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hairline)" }}>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4,
          width: 2, background: "var(--primary)", borderRadius: 1,
        }} />
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600,
          color: "var(--fg-3)", letterSpacing: "0.06em",
          display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8,
        }}>
          <Icon name="sparkles" size={11} strokeWidth={1.7} color="var(--primary)" />
          {eyebrow}
          {severity && <span style={{ color: "var(--status-overdue)" }}>· {severity}</span>}
        </div>
        {title && (
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600,
            color: "var(--fg-1)", marginBottom: 6,
          }}>{title}</div>
        )}
        {body && (
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)",
          }}>{body}</div>
        )}
        {footer && <div style={{ marginTop: 12 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ─── Variants ───────────────────────────────────────────────
function ChatA({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <AstraTurn time="19:38">How did the day land?</AstraTurn>
      <UserTurn time="19:40">Steady, mostly. Reading slipped past nine again.</UserTurn>
      <AstraTurn time="19:42">Three Thursdays running. The window's narrow on weekday evenings — anything you'd shift?</AstraTurn>
      <UserTurn time="19:44" image>Here's the page I stopped at.</UserTurn>
      <AstraTurn time="19:45">A reasonable spot to pause. Try moving the slot to 20:00; the next four days will tell.</AstraTurn>
    </ChatShell>
  );
}

function ChatB({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 24, padding: "32px 24px",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
          color: "var(--fg-3)", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 8,
        }}>
          RESUMING · Yesterday at 21:42
          <QuietLink color="var(--fg-1)">Open</QuietLink>
        </div>
        <div style={{
          width: 132, height: 132, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            position: "absolute", inset: 0, borderRadius: 999,
            boxShadow: "inset 0 0 0 1.5px var(--primary)",
            animation: "orbit-rotate 3.2s linear infinite",
          }} />
          <span style={{
            position: "absolute", inset: 10, borderRadius: 999,
            boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
            animation: "orbit-rotate 5.6s linear infinite reverse",
          }} />
          <Icon name="sparkles" size={36} strokeWidth={1.3} color="var(--fg-1)" />
        </div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 600,
          color: "var(--fg-1)", letterSpacing: "-0.01em", textAlign: "center",
        }}>How did the day land?</div>
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-3)",
          textAlign: "center", maxWidth: 280, lineHeight: 1.5, fontStyle: "italic",
        }}>I can recap, plan, or help you adjust a habit.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingTop: 6 }}>
          {["Recap today", "Plan tomorrow", "Adjust a habit"].map(s => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      </div>
    </ChatShell>
  );
}

function ChatC({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:44">Delete the three habits I marked yesterday.</UserTurn>
      <ChatCard
        eyebrow="PENDING · HIGH RISK"
        title="Delete three habits and their history?"
        body="Removes Reading 30 min, Stretching, and Late-night screen. Can't be undone."
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <CodeInput value="" />
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
              color: "var(--fg-3)", letterSpacing: "0.04em",
            }}>
              <span>Resend in 0:54</span>
              <QuietLink>Cancel</QuietLink>
            </div>
            <PrimaryButton>Verify</PrimaryButton>
          </div>
        }
      />
    </ChatShell>
  );
}

function ChatD({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:44">Break Morning routine into smaller habits.</UserTurn>
      <ChatCard
        eyebrow="BREAKDOWN"
        body="Break Morning routine into:"
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["Drink water", "Stretch 5 minutes", "Make the bed", "Coffee & read"].map(t => (
              <div key={t} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 0", borderBottom: "1px solid var(--hairline)",
              }}>
                <SelectCheck selected={true} size={16} />
                <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{t}</span>
                <Chip active>Daily</Chip>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)" }}>
                Create as parent <MonoToggle on />
              </span>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <QuietLink>Cancel</QuietLink>
                <PrimaryButton>Create 4</PrimaryButton>
              </div>
            </div>
          </div>
        }
      />
    </ChatShell>
  );
}

function ChatE({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:44">I want to read more.</UserTurn>
      <ChatCard
        eyebrow="CLARIFICATION"
        body="How often, and at what time of day?"
        footer={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Daily · 21:00","Weekdays · 07:30","Weekends","Custom"].map(c => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        }
      />
    </ChatShell>
  );
}

function ChatF({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:44">Add 'Late-night reading' at 23:30.</UserTurn>
      <ChatCard
        eyebrow="CONFLICT"
        severity="MEDIUM"
        title="Two habits overlap near midnight."
        body={<>
          Conflicts with:
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)" }}>
            <li>Stretching · 22:30</li>
            <li>Wind down · 23:00</li>
          </ul>
          <div style={{ marginTop: 10, fontStyle: "italic" }}>Consider shifting earlier, or merging into Wind down.</div>
        </>}
      />
    </ChatShell>
  );
}

function ChatG({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:44">Create Read 30 min, Daily, 21:00, tag Reading.</UserTurn>
      <AstraTurn time="19:45">Created. Linked to your Reading tag and set the evening reminder.</AstraTurn>
      <div style={{ padding: "0 20px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[
          ["check", "Read 30 min", "primary"],
          ["info", "Tag · Reading", "fg-2"],
          ["check", "Reminder · 21:00", "primary"],
        ].map(([icon, name, color]) => (
          <span key={name} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--fg-1)",
            padding: "5px 10px", borderRadius: 6,
            boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
          }}>
            <Icon name={icon} size={12} strokeWidth={1.7}
              color={color === "primary" ? "var(--primary)" : "var(--fg-3)"} />
            {name}
          </span>
        ))}
      </div>
    </ChatShell>
  );
}

function ChatH({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark} inputState="voice">
      <AstraTurn time="19:38">How did the day land?</AstraTurn>
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 20px",
        fontFamily: "var(--font-sans)", fontSize: 13, fontStyle: "italic",
        color: "var(--fg-3)", textAlign: "center",
      }}>Recording — tap stop when done.</div>
    </ChatShell>
  );
}

function ChatI({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark}>
      <UserTurn time="19:38">I want to plan tomorrow.</UserTurn>
      <AstraTurn time="19:39">A clear ask. Let's begin with what carried today, then tomorrow's first move.</AstraTurn>
      <UserTurn time="19:42">I read for forty minutes.</UserTurn>
      <AstraTurn time="19:43">A solid window. The longest in three weeks.</AstraTurn>
      <UserTurn time="19:46">Ran three kilometers.</UserTurn>
      <div style={{
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        padding: "10px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
          color: "var(--fg-2)", letterSpacing: "0.04em",
        }}>5 / 5 messages today</span>
        <QuietLink color="var(--fg-1)">Watch an ad</QuietLink>
      </div>
    </ChatShell>
  );
}

function ChatJ({ scheme = "purple", dark = true }) {
  return (
    <ChatShell scheme={scheme} dark={dark} inputState="offline">
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "60px 24px", gap: 16,
      }}>
        <Icon name="wifi-off" size={28} strokeWidth={1.4} color="var(--fg-3)" />
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-2)",
          fontStyle: "italic", textAlign: "center",
        }}>Not connected — chat unavailable while offline.</div>
      </div>
    </ChatShell>
  );
}


Object.assign(window, {
  ChatShell, ChatInput, UserTurn, AstraTurn, ChatCard,
  ChatA, ChatB, ChatC, ChatD, ChatE, ChatF, ChatG, ChatH, ChatI, ChatJ,
});
