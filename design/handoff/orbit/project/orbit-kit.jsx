// ============================================================
// Orbit — Figma-native component kit
// Built from scratch to match the attached Figma exactly:
// navy canvas, violet accent, gradient headers, flat list rows
// (icon · title · description · trailing), switches, radios,
// plan cards, stat tiles, glowing pill CTAs, bottom sheets.
// Portuguese copy, Android 412×892 frames.
// ============================================================

// ─── Lucide icon ─────────────────────────────────────────────
function Icon({ name, size = 22, color = "currentColor", strokeWidth = 1.8, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide?.createIcons && ref.current) {
      window.lucide.createIcons({
        attrs: { width: size, height: size, "stroke-width": strokeWidth, stroke: color },
        nameAttr: "data-lucide", icons: window.lucide.icons,
      });
    }
  });
  return <i ref={ref} data-lucide={name}
    style={{ display: "inline-flex", width: size, height: size, color, flexShrink: 0, ...style }} />;
}

// ─── Phone shell ─────────────────────────────────────────────
function Phone({ width = 412, height = 892, dark = true, scheme = "purple", time = "12:30",
  statusOnGradient = false, children }) {
  return (
    <div className={`scheme-${scheme} ${dark ? "dark" : "light"}`} style={{
      width, height, borderRadius: 42, padding: 7,
      background: dark ? "#05030f" : "#c9cdd6",
      boxShadow: dark ? "0 28px 70px rgba(0,0,0,0.55), 0 8px 22px rgba(0,0,0,0.3)"
        : "0 28px 70px rgba(15,16,22,0.18)",
      boxSizing: "border-box", flexShrink: 0,
    }}>
      <div style={{
        width: "100%", height: "100%", borderRadius: 35, overflow: "hidden",
        background: "var(--bg)", color: "var(--fg-1)",
        display: "flex", flexDirection: "column", position: "relative",
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Status bar (Roboto · 12:30 · 50%) ──────────────────────
function StatusBar({ time = "12:30", onLight = false }) {
  const c = "var(--fg-1)";
  return (
    <div style={{
      height: 44, padding: "0 22px", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      position: "relative", zIndex: 6,
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500, color: c, fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: c }}>
        <Icon name="wifi" size={15} strokeWidth={2.2} />
        <Icon name="signal" size={15} strokeWidth={2.2} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: c, fontVariantNumeric: "tabular-nums" }}>50%</span>
        <Icon name="battery-medium" size={18} strokeWidth={2.2} />
      </div>
    </div>
  );
}

function HomeIndicator() {
  return (
    <div style={{ height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ width: 132, height: 5, borderRadius: 3, background: "var(--fg-1)", opacity: 0.5 }} />
    </div>
  );
}

// ─── Nav header — centered UPPERCASE · back · help/X ────────
function NavHeader({ title, back = true, right = "help", onRight, transparent = false }) {
  const RightBtn = () => {
    if (!right) return <span style={{ width: 40 }} />;
    if (right === "help") return (
      <button aria-label="Ajuda" style={circBtn}><Icon name="help-circle" size={22} color="var(--fg-1)" /></button>
    );
    if (right === "close") return (
      <button aria-label="Fechar" style={iconBtn}><Icon name="x" size={24} color="var(--fg-1)" /></button>
    );
    if (right === "share") return (
      <button aria-label="Compartilhar" style={iconBtn}><Icon name="share-2" size={21} color="var(--fg-1)" /></button>
    );
    return <span style={{ width: 40 }} />;
  };
  return (
    <div style={{
      minHeight: 56, padding: "8px 14px", flexShrink: 0,
      display: "flex", alignItems: "center", gap: 4,
      background: transparent ? "transparent" : "transparent",
      position: "relative", zIndex: 5,
    }}>
      <div style={{ width: 40, display: "flex", justifyContent: "flex-start" }}>
        {back && <button aria-label="Voltar" style={iconBtn}><Icon name="chevron-left" size={26} strokeWidth={2} color="var(--fg-1)" /></button>}
      </div>
      <div style={{
        flex: 1, textAlign: "center",
        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
        letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--fg-1)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{title}</div>
      <div style={{ width: 40, display: "flex", justifyContent: "flex-end" }}>
        <RightBtn />
      </div>
    </div>
  );
}

const iconBtn = {
  appearance: "none", border: 0, background: "transparent", cursor: "pointer",
  width: 40, height: 40, borderRadius: 999, padding: 0,
  display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--fg-1)",
};
const circBtn = {
  ...iconBtn, boxShadow: "inset 0 0 0 1.5px var(--hairline-strong)",
};

// ─── Gradient header backdrop ───────────────────────────────
function GradientTop({ height = 300 }) {
  return <div style={{ position: "absolute", top: 0, left: 0, right: 0, height, background: "var(--gradient-header)", pointerEvents: "none", zIndex: 0 }} />;
}

// ─── Scroll body ────────────────────────────────────────────
function Body({ children, pad = false, style }) {
  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: "auto", position: "relative", zIndex: 1,
      padding: pad ? "8px 20px 24px" : 0, ...style,
    }}>{children}</div>
  );
}

// ─── Section title (Geral / Data e hora …) ──────────────────
function SectionTitle({ children, top = 24, bottom = 14 }) {
  return (
    <div style={{
      padding: `${top}px 20px ${bottom}px`,
      fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500,
      color: "var(--fg-1)", letterSpacing: "-0.01em",
    }}>{children}</div>
  );
}

// ─── Flat list row · icon · title · desc · trailing ─────────
function ListRow({ icon, iconColor = "var(--fg-1)", title, desc, trailing, badge, chevron = true,
  onTap, danger = false, divider = false }) {
  return (
    <div onClick={onTap} style={{
      display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
      cursor: onTap ? "pointer" : "default",
      borderBottom: divider ? "1px solid var(--hairline)" : "none",
    }}>
      {icon && (
        <span style={{ width: 26, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={22} color={danger ? "var(--status-bad)" : iconColor} strokeWidth={1.8} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 400,
          color: danger ? "var(--status-bad)" : "var(--fg-1)", lineHeight: 1.25,
        }}>{title}</span>
        {desc && <span style={{
          fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 400,
          color: "var(--slate-400)", lineHeight: 1.35, textWrap: "pretty",
        }}>{desc}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {trailing}
        {badge}
        {chevron && <Icon name="chevron-right" size={22} color="var(--slate-500)" strokeWidth={1.8} />}
      </div>
    </div>
  );
}

// ─── Switch row ─────────────────────────────────────────────
function SwitchRow({ icon, title, desc, on = false, onToggle, divider = false }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
      borderBottom: divider ? "1px solid var(--hairline)" : "none",
    }}>
      {icon && (
        <span style={{ width: 26, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={22} color="var(--fg-1)" strokeWidth={1.8} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 18, color: "var(--fg-1)", lineHeight: 1.25 }}>{title}</span>
        {desc && <span style={{
          fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", lineHeight: 1.35, textWrap: "pretty",
        }}>{desc}</span>}
      </div>
      <Switch on={on} onToggle={onToggle} />
    </div>
  );
}

function Switch({ on = false, onToggle }) {
  return (
    <button onClick={onToggle} aria-label="alternar" style={{
      appearance: "none", border: 0, cursor: "pointer",
      width: 48, height: 28, borderRadius: 999, padding: 3, flexShrink: 0,
      background: on ? "var(--primary)" : "rgba(248,250,252,0.16)",
      display: "inline-flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start",
      transition: "background var(--dur-base) var(--ease-standard)",
    }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.35)" }} />
    </button>
  );
}

// ─── Radio ──────────────────────────────────────────────────
function Radio({ selected }) {
  return (
    <span style={{
      width: 24, height: 24, borderRadius: 999, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: selected ? "var(--primary)" : "transparent",
      boxShadow: selected ? "none" : "inset 0 0 0 2px var(--slate-500)",
    }}>
      {selected && <span style={{ width: 9, height: 9, borderRadius: 999, background: "#fff" }} />}
    </span>
  );
}

function RadioRow({ label, selected, dot, onTap, divider = true }) {
  return (
    <div onClick={onTap} style={{
      display: "flex", alignItems: "center", gap: 16, padding: "16px 4px",
      borderBottom: divider ? "1px solid var(--hairline)" : "none", cursor: "pointer",
    }}>
      <Radio selected={selected} />
      <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 17, color: "var(--fg-1)" }}>{label}</span>
      {dot && <span style={{ width: 12, height: 12, borderRadius: 999, background: dot }} />}
    </div>
  );
}

// ─── Badge / pill ───────────────────────────────────────────
function Badge({ children = "PREMIUM", tone = "violet" }) {
  const map = {
    violet: { bg: "var(--primary)", fg: "#fff" },
    soft: { bg: "rgba(127,70,247,0.18)", fg: "var(--violet-300)" },
    outline: { bg: "transparent", fg: "var(--slate-300)", ring: "var(--hairline-strong)" },
    amber: { bg: "rgba(254,154,0,0.18)", fg: "var(--amber-400)" },
  };
  const s = map[tone] || map.violet;
  return (
    <span style={{
      fontFamily: "var(--font-sans)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
      textTransform: "uppercase", color: s.fg, background: s.bg,
      padding: "3px 9px", borderRadius: 999,
      boxShadow: s.ring ? `inset 0 0 0 1px ${s.ring}` : "none",
    }}>{children}</span>
  );
}

// ─── Buttons ────────────────────────────────────────────────
function Pill({ children, onClick, leading, full = false, glow = true, disabled = false, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      appearance: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer",
      background: "var(--primary)", color: "#fff",
      fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500,
      padding: "15px 26px", borderRadius: 999, width: full ? "100%" : undefined,
      opacity: disabled ? 0.4 : 1,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9,
      boxShadow: glow && !disabled ? "0 8px 28px rgba(127,70,247,0.45)" : "none",
      ...style,
    }}>{leading}{children}</button>
  );
}

function WhitePill({ children, onClick, leading, full = false, style }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", border: 0, cursor: "pointer",
      background: "var(--fg-1)", color: "var(--slate-950)",
      fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500,
      padding: "14px 26px", borderRadius: 999, width: full ? "100%" : undefined,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, ...style,
    }}>{leading}{children}</button>
  );
}

function GhostPill({ children, onClick, leading, full = false, style }) {
  return (
    <button onClick={onClick} style={{
      appearance: "none", cursor: "pointer", background: "transparent", color: "var(--fg-1)",
      border: 0, boxShadow: "inset 0 0 0 1.5px var(--hairline-strong)",
      fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500,
      padding: "14px 26px", borderRadius: 999, width: full ? "100%" : undefined,
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, ...style,
    }}>{leading}{children}</button>
  );
}

// ─── Stat tile (🔥 7 dias · Sequência) ──────────────────────
function StatTile({ emoji, value, label }) {
  return (
    <div style={{
      flex: 1, borderRadius: 18, padding: "18px 12px 16px",
      background: "rgba(248,250,252,0.05)", boxShadow: "inset 0 0 0 1px var(--hairline)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      <span style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>{value}</span>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>{label}</span>
    </div>
  );
}

// ─── Plan card (Subscription) ───────────────────────────────
function PlanCard({ name, badge, price, sub, features = [], selected, onTap }) {
  return (
    <div onClick={onTap} style={{
      borderRadius: 18, padding: "18px 18px 20px", cursor: "pointer",
      background: selected ? "rgba(127,70,247,0.10)" : "rgba(248,250,252,0.04)",
      boxShadow: selected ? "inset 0 0 0 1.5px var(--primary)" : "inset 0 0 0 1px var(--hairline)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>{name}</span>
            {badge && <Badge tone="violet">{badge}</Badge>}
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--fg-1)" }}>{price}</div>
          {sub && <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--slate-400)", marginTop: 2 }}>{sub}</div>}
        </div>
        <Radio selected={selected} />
      </div>
      {features.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="check" size={16} color="var(--violet-300)" strokeWidth={2.4} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-300)" }}>{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Info card (bordered, icon + title + desc) ──────────────
function InfoCard({ icon = "sparkles", title, desc, tone = "violet" }) {
  return (
    <div style={{
      borderRadius: 18, padding: "16px 18px",
      background: "rgba(127,70,247,0.08)", boxShadow: "inset 0 0 0 1px rgba(127,70,247,0.28)",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <Icon name={icon} size={24} color="var(--violet-400)" strokeWidth={1.9} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: "var(--fg-1)" }}>{title}</div>
        {desc && <div style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, color: "var(--slate-400)", marginTop: 3, lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </div>
  );
}

// ─── Text field ─────────────────────────────────────────────
function Field({ label, value, placeholder, type = "text", trailing, autoFocus }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {label && <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--slate-300)" }}>{label}</span>}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, minHeight: 54,
        background: "rgba(248,250,252,0.05)", borderRadius: 14, padding: "0 16px",
        boxShadow: "inset 0 0 0 1px var(--hairline)",
      }}>
        <input type={type} defaultValue={value} placeholder={placeholder} autoFocus={autoFocus} style={{
          flex: 1, minWidth: 0, appearance: "none", border: 0, background: "transparent", outline: "none",
          fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)",
        }} />
        {trailing}
      </div>
    </div>
  );
}

// ─── OTP boxes ──────────────────────────────────────────────
function OTP({ value = "" }) {
  const chars = (value || "").split("");
  const active = chars.length;
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {Array(6).fill(0).map((_, i) => (
        <div key={i} style={{
          width: 48, height: 58, borderRadius: 14,
          background: "rgba(248,250,252,0.05)",
          boxShadow: i === active ? "inset 0 0 0 2px var(--primary)" : "inset 0 0 0 1px var(--hairline)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500, color: "var(--fg-1)",
        }}>{chars[i] || ""}</div>
      ))}
    </div>
  );
}

// ─── Bottom sheet ───────────────────────────────────────────
function Sheet({ title, onClose, children, footer }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 20 }} />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 21,
        background: "rgb(13,15,33)", borderTopLeftRadius: 26, borderTopRightRadius: 26,
        boxShadow: "0 -16px 44px rgba(0,0,0,0.5)", maxHeight: "82%",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 44, height: 5, borderRadius: 999, background: "var(--hairline-strong)" }} />
        </div>
        {title && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 22px 8px" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>{title}</span>
            <button onClick={onClose} style={iconBtn}><Icon name="x" size={24} color="var(--slate-300)" /></button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 22px 8px" }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px 20px", flexShrink: 0 }}>{footer}</div>}
      </div>
    </>
  );
}

// ─── Bottom nav ─────────────────────────────────────────────
function TabBar({ active = "home", showFab = true }) {
  const tabs = [
    { id: "home", label: "Início", icon: "house" },
    { id: "astra", label: "Astra", icon: "sparkles" },
    { id: "calendar", label: "Agenda", icon: "calendar-days" },
    { id: "profile", label: "Perfil", icon: "user" },
  ];
  return (
    <div style={{ position: "relative", flexShrink: 0, borderTop: "1px solid var(--hairline)", background: "var(--bg)" }}>
      {showFab && active !== "astra" && active !== "profile" && (
        <button aria-label="Criar" style={{
          position: "absolute", left: "50%", top: -30, transform: "translateX(-50%)",
          appearance: "none", border: 0, cursor: "pointer", width: 60, height: 60, borderRadius: 999,
          background: "var(--primary)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 0 6px var(--bg), 0 8px 24px rgba(127,70,247,0.45)", zIndex: 2,
        }}><Icon name="plus" size={28} strokeWidth={2.2} color="#fff" /></button>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 84px 1fr 1fr", padding: "10px 0 12px" }}>
        {tabs.slice(0, 2).map(t => <Tab key={t.id} t={t} active={active === t.id} />)}
        <div />
        {tabs.slice(2).map(t => <Tab key={t.id} t={t} active={active === t.id} />)}
      </div>
    </div>
  );
}
function Tab({ t, active }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: active ? "var(--primary)" : "var(--slate-500)" }}>
      <Icon name={t.icon} size={24} strokeWidth={active ? 2.2 : 1.8} color="currentColor" />
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: active ? 500 : 400 }}>{t.label}</span>
    </div>
  );
}

// ─── Satellite empty-state glyph ────────────────────────────
function Satellite({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <circle cx="34" cy="34" r="19" stroke="var(--slate-500)" strokeWidth="2.5" />
      <path d="M34 21 a13 13 0 0 1 13 13" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="34" r="5" fill="var(--slate-400)" />
      <rect x="52" y="52" width="22" height="13" rx="2.5" transform="rotate(45 63 58)" stroke="var(--slate-500)" strokeWidth="2.5" />
      <path d="M63 70 L63 84" stroke="var(--slate-500)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M56 84 L70 84" stroke="var(--slate-500)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="74" cy="22" r="2" fill="var(--violet-300)" />
      <circle cx="20" cy="68" r="1.6" fill="var(--violet-300)" />
    </svg>
  );
}

// ─── Scalloped verified badge (success) ─────────────────────
function VerifiedBadge({ size = 96 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: "rgba(127,70,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <path d="M12 1.5l2.3 1.7 2.8-.4 1.2 2.6 2.6 1.2-.4 2.8L22 12l-1.7 2.3.4 2.8-2.6 1.2-1.2 2.6-2.8-.4L12 22.5l-2.3-1.7-2.8.4-1.2-2.6-2.6-1.2.4-2.8L2 12l1.7-2.3-.4-2.8 2.6-1.2L7.1 3.1l2.8.4z" stroke="var(--primary)" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(127,70,247,0.12)" />
        <path d="M8.5 12.2l2.4 2.3 4.6-4.8" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── LazyMount — defer off-screen artboards ─────────────────
function LazyMount({ children, rootMargin = "500px", width = 412, height = 892 }) {
  const [visible, setVisible] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (visible) return;
    const el = ref.current; if (!el) return;
    let io;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin });
      io.observe(el);
      // Fallback: some embedded/preview environments never deliver an
      // IntersectionObserver callback. Reveal unconditionally shortly after
      // mount so content always appears (IO still reveals earlier when alive).
      const t = setTimeout(() => setVisible(true), 350);
      return () => { clearTimeout(t); io && io.disconnect(); };
    }
    setVisible(true);
  }, [visible]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{visible ? children : <PhonePlaceholder width={width} height={height} />}</div>;
}
function PhonePlaceholder({ width = 412, height = 892 }) {
  return (
    <div style={{ width, height, borderRadius: 42, padding: 7, background: "#05030f", boxSizing: "border-box", boxShadow: "0 28px 70px rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 35, background: "rgb(2,6,24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Roboto', sans-serif", fontSize: 12, fontWeight: 500, color: "rgb(98,116,142)" }}>Carregando</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, Phone, StatusBar, HomeIndicator, NavHeader, GradientTop, Body, SectionTitle,
  ListRow, SwitchRow, Switch, Radio, RadioRow, Badge, Pill, WhitePill, GhostPill,
  StatTile, PlanCard, InfoCard, Field, OTP, Sheet, TabBar, Tab, Satellite, VerifiedBadge,
  LazyMount, PhonePlaceholder, iconBtn, circBtn,
});
