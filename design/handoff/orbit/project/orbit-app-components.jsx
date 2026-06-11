// ============================================================
// Orbit — App-wide chrome (Linear-style redirect)
// Bottom nav with Plus FAB · Pull-quote ·
// Confirm dialog · Toast · Streak badge · etc.
// ============================================================

// ─── Bottom nav: 4 tabs + centered Plus FAB ─────────────────
function BottomNav({ active = "today", onTab, onFab, astraUnread = false, showFab = true }) {
  const tabs = [
    { id: "today",    label: "Home",     icon: "home" },
    { id: "chat",     label: "Astra",   icon: "sparkles", emphasize: true },
    { id: "calendar", label: "Calendar", icon: "calendar-days" },
    { id: "profile",  label: "You",      icon: "user" },
  ];
  return (
    <div style={{
      position: "relative", flexShrink: 0,
      borderTop: "1px solid var(--hairline)", background: "var(--bg)",
    }}>
      {showFab && active !== "chat" && active !== "profile" && (
        <button onClick={onFab} aria-label="Create" style={{
          position: "absolute", left: "50%", top: -28,
          transform: "translateX(-50%)",
          appearance: "none", border: 0, cursor: "pointer",
          width: 56, height: 56, borderRadius: 999,
          background: "var(--primary)", color: "var(--fg-on-primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 0 5px var(--bg), 0 4px 14px rgba(0,0,0,0.35)",
          zIndex: 2,
        }}>
          <Icon name="plus" size={24} strokeWidth={1.7} color="var(--fg-on-primary)" />
        </button>
      )}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 80px 1fr 1fr",
        padding: "8px 0 10px",
      }}>
        {tabs.slice(0, 2).map(t => <TabBtn key={t.id} tab={t} active={active === t.id} onClick={() => onTab && onTab(t.id)} unread={t.id === "chat" && astraUnread} />)}
        <div />
        {tabs.slice(2, 4).map(t => <TabBtn key={t.id} tab={t} active={active === t.id} onClick={() => onTab && onTab(t.id)} />)}
      </div>
    </div>
  );
}

function TabBtn({ tab, active, onClick, unread }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, background: "transparent",
      padding: "4px 0 0", cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      color: active ? "var(--fg-1)" : "var(--fg-3)",
      position: "relative",
    }}>
      {active && (
        <span style={{
          position: "absolute", top: -1, left: "50%", transform: "translateX(-50%)",
          width: 14, height: 2, background: "var(--primary)", borderRadius: 1,
        }} />
      )}
      <span style={{ position: "relative" }}>
        <Icon name={tab.icon} size={22} strokeWidth={1.5}
          color={tab.emphasize && active ? "var(--primary)" : "currentColor"} />
        {unread && (
          <span style={{
            position: "absolute", top: -2, right: -3,
            width: 6, height: 6, borderRadius: 999, background: "var(--primary)",
            boxShadow: "0 0 0 2px var(--bg)",
          }} />
        )}
      </span>
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: 11,
        fontWeight: active ? 500 : 400, letterSpacing: "0.01em",
      }}>{tab.label}</span>
    </button>
  );
}

// ─── Streak badge for app bar ───────────────────────────────
function StreakBadge({ streak = 47 }) {
  if (streak < 1) return null;
  const active = streak >= 2;
  return (
    <button style={{
      appearance: "none", border: 0, cursor: "pointer",
      background: "transparent",
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
      borderRadius: 6, padding: "0 7px", height: 24,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <svg width="11" height="12" viewBox="0 0 24 24" fill="none"
        stroke={active ? "var(--status-bad)" : "var(--fg-3)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
        color: "var(--fg-1)", fontVariantNumeric: "tabular-nums",
      }}>{streak}</span>
    </button>
  );
}

// ─── Theme + bell utility cluster ───────────────────────────
function UtilityCluster({ dark, unread, streak, onToggleTheme, onBell }) {
  return (
    <>
      <button onClick={onToggleTheme} aria-label="Theme" style={iconBtn}>
        <Icon name={dark ? "sun" : "moon"} size={17} strokeWidth={1.5} color="var(--fg-2)" />
      </button>
      <button onClick={onBell} aria-label="Notifications" style={{ ...iconBtn, position: "relative" }}>
        <Icon name="bell" size={17} strokeWidth={1.5} color="var(--fg-2)" />
        {unread && (
          <span style={{
            position: "absolute", top: 8, right: 8,
            width: 6, height: 6, borderRadius: 999, background: "var(--primary)",
            boxShadow: "0 0 0 2px var(--bg)",
          }} />
        )}
      </button>
      {streak != null && <StreakBadge streak={streak} />}
    </>
  );
}

// ─── SettingsRow ────────────────────────────────────────────
function SettingsRow({ label, value, valueColor, accessory = "chevron", onTap, mono = false, children, leadingDot }) {
  return (
    <div onClick={onTap} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px", gap: 12,
      borderBottom: "1px solid var(--hairline)",
      cursor: onTap ? "pointer" : "default",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {leadingDot && <span style={{ width: 8, height: 8, borderRadius: 999, background: leadingDot, flexShrink: 0 }} />}
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 400,
          color: "var(--fg-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{label}</span>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, color: "var(--fg-3)",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: mono ? 13 : 14,
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
        flexShrink: 0,
      }}>
        {value && <span style={{
          color: valueColor || "var(--fg-3)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220,
        }}>{value}</span>}
        {children}
        {accessory === "chevron" && <Icon name="chevron-right" size={16} strokeWidth={1.5} color="var(--fg-4)" />}
      </div>
    </div>
  );
}

// ─── MonoToggle ON/OFF ──────────────────────────────────────
function MonoToggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, cursor: "pointer",
      background: on ? "var(--bg-elev)" : "transparent",
      boxShadow: on ? "inset 0 0 0 1px var(--fg-3)" : "inset 0 0 0 1px var(--hairline-strong)",
      borderRadius: 6, padding: "3px 9px",
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
      letterSpacing: "0.06em", textTransform: "uppercase",
      color: on ? "var(--fg-1)" : "var(--fg-3)",
    }}>{on ? "On" : "Off"}</button>
  );
}

// ─── SchemeSwatches ─────────────────────────────────────────
const SCHEME_COLORS = {
  purple: "#7c3aed", blue: "#2563eb", green: "#16a34a",
  rose: "#e11d48", orange: "#ea580c", cyan: "#0891b2",
};
function SchemeSwatches({ active = "purple", onSelect, lockNonDefault = false }) {
  const schemes = ["purple", "blue", "green", "rose", "orange", "cyan"];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {schemes.map(s => {
        const isActive = s === active;
        const locked = lockNonDefault && s !== "purple";
        return (
          <button key={s} aria-label={s} style={{
            appearance: "none", border: 0, background: "transparent", cursor: locked ? "default" : "pointer",
            padding: 0, position: "relative",
            opacity: locked ? 0.85 : 1,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 999,
              boxShadow: isActive ? "inset 0 0 0 2px var(--fg-1)" : "none",
              padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 999, background: SCHEME_COLORS[s],
              }} />
            </span>
            {locked && <Icon name="lock" size={9} strokeWidth={1.7} color="var(--fg-4)" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Buttons ────────────────────────────────────────────────
function PrimaryButton({ children, onClick, fullWidth = false, disabled = false, leading, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      appearance: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer",
      background: "var(--primary)", color: "var(--fg-on-primary)",
      fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500,
      padding: "11px 22px", borderRadius: 8,
      width: fullWidth ? "100%" : undefined,
      opacity: disabled ? 0.45 : 1,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      ...style,
    }}>{leading}{children}</button>
  );
}

function SecondaryButton({ children, onClick, fullWidth = false, leading, style }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", cursor: "pointer", background: "transparent",
      color: "var(--fg-1)", border: 0,
      boxShadow: "inset 0 0 0 1px var(--hairline-strong)",
      fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500,
      padding: "10px 22px", borderRadius: 8,
      width: fullWidth ? "100%" : undefined,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      ...style,
    }}>{leading}{children}</button>
  );
}

function QuietLink({ children, onClick, color = "var(--fg-3)", size = 13, italic = false, style }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, background: "transparent", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: size, fontWeight: 500,
      color, padding: 0,
      textDecoration: "underline", textUnderlineOffset: 3, textDecorationThickness: 1,
      textDecorationColor: "var(--hairline-strong)",
      fontStyle: italic ? "italic" : "normal",
      ...style,
    }}>{children}</button>
  );
}

// ─── Inputs ────────────────────────────────────────────────
function UnderlinedInput({ label, value, placeholder, type = "text", mono = false, trailing, autoFocus, large = false, multiline = false, rows = 3 }) {
  return (
    <div style={{
      borderBottom: "1px solid var(--hairline-strong)",
      padding: "8px 0 8px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      {label && <div style={{
        fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 500,
        color: "var(--fg-3)",
      }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {multiline ? (
          <textarea rows={rows} defaultValue={value} placeholder={placeholder}
            style={{
              flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)",
              padding: 0, resize: "none", lineHeight: 1.5,
            }} />
        ) : (
          <input type={type} defaultValue={value} placeholder={placeholder} autoFocus={autoFocus}
            style={{
              flex: 1, minWidth: 0,
              appearance: "none", border: 0, background: "transparent", outline: "none",
              fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
              fontSize: large ? 22 : 15, color: "var(--fg-1)",
              fontWeight: large ? 600 : 400, letterSpacing: large ? "-0.01em" : "0",
              padding: 0,
              fontVariantNumeric: mono ? "tabular-nums" : "normal",
            }} />
        )}
        {trailing}
      </div>
    </div>
  );
}

// ─── 6-digit code input ─────────────────────────────────────
function CodeInput({ value = "" }) {
  return (
    <div style={{
      borderBottom: "1px solid var(--hairline-strong)",
      padding: "12px 0 10px",
      fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500,
      letterSpacing: "0.4em", color: "var(--fg-1)",
      fontVariantNumeric: "tabular-nums",
      textAlign: "center",
      minHeight: 36,
    }}>{value || <span style={{ color: "var(--fg-4)" }}>------</span>}</div>
  );
}

// ─── BottomSheet ────────────────────────────────────────────
function BottomSheet({ children, heightPct = 88 }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0,
      height: `${heightPct}%`,
      background: "var(--bg-elev)",
      borderTop: "1px solid var(--hairline-strong)",
      borderTopLeftRadius: 18, borderTopRightRadius: 18,
      boxShadow: "0 -10px 32px rgba(0,0,0,0.25)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px", flexShrink: 0 }}>
        <div style={{ width: 32, height: 3, borderRadius: 999, background: "var(--hairline-strong)" }} />
      </div>
      {children}
    </div>
  );
}

// ─── Modal scrim + ConfirmDialog ────────────────────────────
function Scrim({ children, opacity = 0.5 }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: `rgba(0,0,0,${opacity})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>{children}</div>
  );
}

function ConfirmDialog({ eyebrow, title, body, cancelLabel = "Cancel", actionLabel, destructive = false, children, onCancel, onAction }) {
  return (
    <div style={{
      width: "100%", maxWidth: 320,
      background: "var(--bg-elev)", borderRadius: 12,
      padding: "18px 20px 12px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35), inset 0 0 0 1px var(--hairline)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {eyebrow && (
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--fg-3)",
        }}>{eyebrow}</div>
      )}
      <div style={{
        fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 600,
        color: "var(--fg-1)", letterSpacing: "-0.01em",
      }}>{title}</div>
      {body && (
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.5,
          color: "var(--fg-2)",
        }}>{body}</div>
      )}
      {children}
      <div style={{
        display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16,
        marginTop: 4,
      }}>
        <button onClick={onCancel} style={{
          appearance: "none", border: 0, background: "transparent", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500,
          color: "var(--fg-3)", padding: 6,
        }}>{cancelLabel}</button>
        {actionLabel && (
          <button onClick={onAction} style={{
            appearance: "none", border: 0, background: "transparent", cursor: "pointer",
            fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600,
            color: "var(--fg-1)", padding: 6,
            fontStyle: destructive ? "italic" : "normal",
          }}>{actionLabel}</button>
        )}
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────
function Toast({ kind = "info", title, body, actionLabel, eyebrow }) {
  const glyphs = { success: "check", error: "x", info: "info", queued: "clock" };
  const colors = { success: "var(--primary)", error: "var(--status-bad)", info: "var(--fg-2)", queued: "var(--fg-2)" };
  return (
    <div style={{
      margin: "18px auto 0", maxWidth: 360,
      background: "var(--bg-elev)",
      borderRadius: 10, padding: "12px 14px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)",
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <span style={{ marginTop: 1, color: colors[kind] || "var(--fg-1)" }}>
        <Icon name={glyphs[kind] || "info"} size={15} strokeWidth={1.7} />
      </span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {eyebrow && (
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--fg-3)",
          }}>{eyebrow}</span>
        )}
        {title && <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--fg-1)" }}>{title}</span>}
        {body && <span style={{
          fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--fg-2)", lineHeight: 1.45,
        }}>{body}</span>}
      </div>
      {actionLabel && (
        <button style={{
          appearance: "none", border: 0, background: "transparent", cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
          color: "var(--fg-1)", padding: 0,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}>{actionLabel}</button>
      )}
    </div>
  );
}

// ─── Edge banner ────────────────────────────────────────────
function EdgeBanner({ children }) {
  return (
    <div style={{
      padding: "10px 20px",
      borderBottom: "1px solid var(--hairline)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexShrink: 0,
    }}>{children}</div>
  );
}

// ─── PullQuote — Astra attribution everywhere ──────────────
function PullQuote({ eyebrow, children, italic = true, paddingX = 20, paddingY = "14px" }) {
  return (
    <div style={{ padding: `${paddingY} ${paddingX}px` }}>
      <div style={{ position: "relative", paddingLeft: 14 }}>
        <span style={{
          position: "absolute", left: 0, top: 4, bottom: 4,
          width: 2, background: "var(--primary)", borderRadius: 1,
        }} />
        {eyebrow && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500,
            letterSpacing: "0.06em", color: "var(--fg-3)",
            marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontFamily: "var(--font-sans)", fontSize: 15, lineHeight: 1.5,
          color: "var(--fg-2)",
          fontStyle: italic ? "italic" : "normal",
          textWrap: "pretty",
        }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Saturn glyph ──────────────────────────────────────────
function SaturnDropcap({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3" stroke="currentColor" strokeWidth="1.4" transform="rotate(-22 12 12)" />
    </svg>
  );
}

// ─── Pro tag (filled, real chip) ────────────────────────────
function ProTag({ children = "Pro" }) {
  return (
    <span style={{
      fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
      color: "var(--fg-on-primary)", background: "var(--primary)",
      padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}>{children}</span>
  );
}

// ─── LazyMount — defer rendering of off-screen artboards ────
function LazyMount({ children, rootMargin = "400px", width = 412, height = 892 }) {
  const [visible, setVisible] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {visible ? children : <PhonePlaceholder width={width} height={height} />}
    </div>
  );
}

function PhonePlaceholder({ width = 412, height = 892 }) {
  return (
    <div style={{
      width, height, borderRadius: 36, padding: 8,
      background: "#0c0c10", boxSizing: "border-box",
      boxShadow: "0 18px 50px rgba(0,0,0,0.40)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 28,
        background: "oklch(0.16 0.012 250)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11, fontWeight: 500, color: "oklch(0.42 0.012 250)",
        }}>Loading</div>
      </div>
    </div>
  );
}

// ─── ProgressDots (onboarding) ──────────────────────────────
function ProgressDots({ active = 0, total = 7 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {Array(total).fill().map((_, i) => (
        <span key={i} style={{
          height: 5, borderRadius: 999,
          background: i === active ? "var(--fg-1)" : "var(--hairline-strong)",
          width: i === active ? 18 : 5,
        }} />
      ))}
    </div>
  );
}

Object.assign(window, {
  BottomNav, TabBtn, StreakBadge, UtilityCluster,
  SettingsRow, MonoToggle, SchemeSwatches, SCHEME_COLORS,
  PrimaryButton, SecondaryButton, QuietLink,
  UnderlinedInput, CodeInput, BottomSheet, Scrim, ConfirmDialog, Toast,
  EdgeBanner, PullQuote, SaturnDropcap, ProTag,
  LazyMount, PhonePlaceholder, ProgressDots,
});
