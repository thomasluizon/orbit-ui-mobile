// ============================================================
// Orbit — Core app screens, designed from scratch in the Figma
// language (gradient headers, rounded cards, violet accents).
// Início · Astra chat · Agenda · Hábito · Criar hábito ·
// Conquistas · Login/OTP · Onboarding · Tudo certo
// ============================================================

// ─── Habit card (Figma-native, roomy) ───────────────────────
function HabitCard({ emoji, name, meta, state = "todo", streak, last }) {
  const done = state === "done";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      borderRadius: 18, background: "rgba(248,250,252,0.04)",
      boxShadow: "inset 0 0 0 1px var(--hairline)", marginBottom: last ? 0 : 10,
    }}>
      <span style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: done ? "var(--slate-400)" : "var(--fg-1)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--slate-600,rgba(255,255,255,.3))" }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--slate-400)" }}>
          <span>{meta}</span>
          {streak >= 2 && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--amber-500)" }}>🔥 {streak}</span>}
        </div>
      </div>
      <span style={{
        width: 30, height: 30, borderRadius: 999, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: done ? "var(--primary)" : "transparent",
        boxShadow: done ? "none" : "inset 0 0 0 2px var(--slate-600,rgba(255,255,255,.22))",
      }}>
        {done && <Icon name="check" size={17} color="#fff" strokeWidth={3} />}
      </span>
    </div>
  );
}

// ─── INÍCIO (Home / Today) ──────────────────────────────────
function Inicio({ scheme = "purple", dark = true }) {
  const habits = [
    { emoji: "🏃", name: "Corrida matinal", meta: "Diário · 07:00", state: "done", streak: 12 },
    { emoji: "🧘", name: "Meditar", meta: "Diário", state: "done", streak: 40 },
    { emoji: "💧", name: "Beber água", meta: "Diário · 6/8" },
    { emoji: "📖", name: "Ler 30 minutos", meta: "Diário · 21:00" },
    { emoji: "🌙", name: "Dormir cedo", meta: "Diário · 23:00", last: true },
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={260} />
        <div style={{ position: "relative", zIndex: 1, padding: "12px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>Quinta · 21 mai</div>
              <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>Bom dia, Thomas</h1>
            </div>
            <button style={{ ...circBtn, background: "rgba(248,250,252,0.06)" }}><span style={{ fontSize: 15 }}>🔥</span></button>
          </div>

          {/* Astra summary card */}
          <div style={{ marginTop: 18, borderRadius: 18, padding: "16px 18px", background: "rgba(127,70,247,0.10)", boxShadow: "inset 0 0 0 1px rgba(127,70,247,0.28)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon name="sparkles" size={16} color="var(--violet-300)" />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--violet-300)" }}>Astra</span>
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)", lineHeight: 1.5, textWrap: "pretty" }}>
              Você está com 2 de 5 hábitos concluídos. Que tal beber água agora para manter o ritmo do dia?
            </div>
          </div>

          {/* progress */}
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>Hoje</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--slate-300)" }}>2/5</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(248,250,252,0.08)", marginBottom: 16, position: "relative" }}>
            <div style={{ position: "absolute", inset: "0 60% 0 0", background: "var(--primary)", borderRadius: 999 }} />
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "0 20px 8px" }}>
          {habits.map((h, i) => <HabitCard key={i} {...h} />)}
        </div>
      </Body>
      <TabBar active="home" />
      <HomeIndicator />
    </Phone>
  );
}

// ─── ASTRA chat (the headline) ──────────────────────────────
function AstraBubble({ children, embed }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      <span style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(127,70,247,0.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="sparkles" size={16} color="var(--violet-300)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "inline-block", maxWidth: "100%", borderRadius: "4px 18px 18px 18px", background: "rgba(248,250,252,0.06)", padding: "12px 15px", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)", lineHeight: 1.5 }}>{children}</div>
        {embed}
      </div>
    </div>
  );
}
function UserBubble({ children }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      <div style={{ maxWidth: "82%", borderRadius: "18px 4px 18px 18px", background: "var(--primary)", padding: "12px 15px", fontFamily: "var(--font-sans)", fontSize: 15, color: "#fff", lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

function AstraChat({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Astra" right="help" />
      <Body style={{ padding: "8px 16px 0" }}>
        <AstraBubble>Bom dia, Thomas! ☀️ Pronto para mais um dia em órbita?</AstraBubble>
        <UserBubble>quero criar um hábito de ler antes de dormir</UserBubble>
        <AstraBubble embed={
          <div style={{ marginTop: 10, borderRadius: 16, padding: "14px 16px", background: "rgba(248,250,252,0.05)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📖</span>
              <div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: "var(--fg-1)" }}>Ler 30 minutos</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--slate-400)", marginTop: 2 }}>Diário · 22:00 · lembrete ativado</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Pill glow={false} style={{ flex: 1, padding: "11px 0", fontSize: 14 }} leading={<Icon name="check" size={16} color="#fff" />}>Criar hábito</Pill>
              <GhostPill style={{ padding: "11px 18px", fontSize: 14 }}>Ajustar</GhostPill>
            </div>
          </div>
        }>
          Ótima ideia! Montei isto pra você — leitura por 30 minutos, todo dia às 22h. Quer criar?
        </AstraBubble>
      </Body>
      {/* action chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 16px 10px", flexShrink: 0, scrollbarWidth: "none" }}>
        {["Resumir meu dia", "Sugerir um hábito", "Como vou na semana?"].map((c, i) => (
          <button key={i} style={{ appearance: "none", border: 0, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, background: "rgba(248,250,252,0.06)", color: "var(--slate-200)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "9px 14px", borderRadius: 999, boxShadow: "inset 0 0 0 1px var(--hairline)" }}>{c}</button>
        ))}
      </div>
      {/* input */}
      <div style={{ padding: "8px 16px 12px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minHeight: 50, background: "rgba(248,250,252,0.06)", borderRadius: 999, padding: "0 8px 0 18px", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
          <input placeholder="Fale com a Astra…" style={{ flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }} />
          <button style={{ ...iconBtn, width: 34, height: 34 }}><Icon name="mic" size={20} color="var(--slate-300)" /></button>
        </div>
        <button aria-label="Enviar" style={{ appearance: "none", border: 0, cursor: "pointer", width: 50, height: 50, borderRadius: 999, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 20px rgba(127,70,247,0.45)" }}><Icon name="arrow-up" size={22} color="#fff" strokeWidth={2.4} /></button>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── AGENDA (calendar) ──────────────────────────────────────
function Agenda({ scheme = "purple", dark = true }) {
  const wk = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  const done = new Set([1, 2, 3, 5, 6, 8, 9, 10, 12, 13, 15, 16, 17, 19, 20]);
  const partial = new Set([4, 7, 11, 14, 18]);
  const cells = [];
  for (let i = 0; i < 3; i++) cells.push(null);
  for (let d = 1; d <= 30; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={180} />
        <div style={{ position: "relative", zIndex: 1, padding: "8px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>Abril 2026</h1>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={iconBtn}><Icon name="chevron-left" size={22} color="var(--slate-300)" /></button>
              <button style={iconBtn}><Icon name="chevron-right" size={22} color="var(--slate-300)" /></button>
            </div>
          </div>
          <div style={{ borderRadius: 18, padding: "16px 14px", background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 8 }}>
              {wk.map(w => <div key={w} style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--slate-500)" }}>{w}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 4 }}>
              {cells.map((d, i) => {
                if (d == null) return <div key={i} style={{ height: 44 }} />;
                const isToday = d === 21 ? false : false;
                const today = d === 20;
                return (
                  <div key={i} style={{ height: 44, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: today ? 700 : 500, color: today ? "var(--fg-1)" : "var(--slate-300)", width: 28, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, boxShadow: today ? "inset 0 0 0 1.5px var(--primary)" : "none" }}>{d}</span>
                    {done.has(d) ? <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--primary)" }} /> : partial.has(d) ? <span style={{ width: 6, height: 6, borderRadius: 999, boxShadow: "inset 0 0 0 1.5px var(--slate-500)" }} /> : <span style={{ width: 6, height: 6 }} />}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 18, marginBottom: 8, fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>20 de abril</div>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "0 20px 8px" }}>
          <HabitCard emoji="🏃" name="Corrida matinal" meta="Concluído · 07:02" state="done" streak={12} />
          <HabitCard emoji="🧘" name="Meditar" meta="Concluído" state="done" streak={40} last />
        </div>
      </Body>
      <TabBar active="calendar" />
      <HomeIndicator />
    </Phone>
  );
}

// ─── HÁBITO (detail) ────────────────────────────────────────
function HabitoDetalhe({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Hábito" right="share" />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 22px" }}>
          <span style={{ width: 76, height: 76, borderRadius: 22, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>🏃</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>Corrida matinal</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)" }}>Diário · 07:00 · Saúde</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <StatTile emoji="🔥" value="12" label="Sequência" />
          <StatTile emoji="📈" value="86%" label="Taxa" />
          <StatTile emoji="✓" value="148" label="Total" />
        </div>
        <SectionTitle top={0} bottom={10}>Últimos 30 dias</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(15,1fr)", gap: 5, marginBottom: 24 }}>
          {Array(30).fill(0).map((_, i) => {
            const on = i % 7 !== 3 && i % 11 !== 5;
            return <span key={i} style={{ aspectRatio: "1", borderRadius: 5, background: on ? "var(--primary)" : "rgba(248,250,252,0.08)", opacity: on ? (0.5 + (i / 60)) : 1 }} />;
          })}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Pill full leading={<Icon name="check" size={18} color="#fff" />}>Concluir hoje</Pill>
          <GhostPill style={{ width: 56, padding: 0, height: 52 }}><Icon name="pencil" size={20} color="var(--fg-1)" /></GhostPill>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── CRIAR HÁBITO (sheet over Home) ─────────────────────────
function CriarHabito({ scheme = "purple", dark = true }) {
  const days = ["S", "T", "Q", "Q", "S", "S", "D"];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, opacity: 0.4, padding: "0 20px" }}>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)" }}>Bom dia, Thomas</h1>
      </div>
      <Sheet title="Novo hábito" footer={<Pill full leading={<Icon name="check" size={18} color="#fff" />}>Criar hábito</Pill>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <span style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>📖</span>
            <div style={{ flex: 1 }}><Field label="Nome" value="Ler 30 minutos" /></div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--slate-300)", marginBottom: 8 }}>Repetir</div>
            <div style={{ display: "flex", gap: 8 }}>
              {days.map((d, i) => (
                <span key={i} style={{ flex: 1, height: 42, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, background: i < 5 ? "var(--primary)" : "rgba(248,250,252,0.06)", color: i < 5 ? "#fff" : "var(--slate-400)" }}>{d}</span>
              ))}
            </div>
          </div>
          <div style={{ borderRadius: 14, background: "rgba(248,250,252,0.05)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--hairline)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}><Icon name="clock" size={20} color="var(--slate-300)" />Horário</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>22:00</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}><Icon name="tag" size={20} color="var(--slate-300)" />Categoria</span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>Mente</span>
            </div>
          </div>
          <SwitchRow icon="bell" title="Lembrete" on />
        </div>
      </Sheet>
    </Phone>
  );
}

// ─── CONQUISTAS (achievements) ──────────────────────────────
function Conquistas({ scheme = "purple", dark = true }) {
  const items = [
    ["🔥", "Primeira chama", true], ["📅", "Uma semana", true], ["🌙", "Madrugador", true],
    ["💯", "Cem dias", false], ["🏔️", "Mil registros", false], ["🎯", "Meta batida", true],
    ["⚡", "Semana perfeita", false], ["🏆", "Um ano", false], ["🌟", "Lendário", false],
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Conquistas" right="help" />
      <Body pad>
        <div style={{ borderRadius: 18, padding: "18px 18px", marginBottom: 8, marginTop: 4, background: "rgba(127,70,247,0.10)", boxShadow: "inset 0 0 0 1px rgba(127,70,247,0.28)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, color: "var(--fg-1)" }}>Nível 7</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }}>Explorer</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--slate-400)", marginTop: 2 }}>23 de 60 conquistas</div>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(248,250,252,0.10)", position: "relative" }}>
            <div style={{ position: "absolute", inset: "0 62% 0 0", background: "var(--primary)", borderRadius: 999 }} />
          </div>
        </div>
        <SectionTitle bottom={12}>Todas</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {items.map(([emoji, label, earned], i) => (
            <div key={i} style={{ borderRadius: 16, padding: "18px 8px 14px", textAlign: "center", background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)", opacity: earned ? 1 : 0.45 }}>
              <div style={{ fontSize: 30, marginBottom: 8, filter: earned ? "none" : "grayscale(1)" }}>{emoji}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: earned ? "var(--fg-1)" : "var(--slate-400)", lineHeight: 1.25 }}>{label}</div>
            </div>
          ))}
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── LOGIN (email → OTP) ────────────────────────────────────
function Login({ step = 1, scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="" back={step === 2} right={null} />
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", padding: "0 24px" }}>
        <GradientTop height={320} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 0 32px" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 30px rgba(127,70,247,0.45)" }}>
            <Icon name="orbit" size={34} color="#fff" strokeWidth={2} />
          </div>
        </div>
        {step === 1 ? (
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Entrar no Orbit</h1>
            <p style={{ margin: "0 0 24px", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center" }}>Enviaremos um código de acesso por e-mail.</p>
            <Field label="E-mail" value="" placeholder="voce@email.com" type="email" />
            <div style={{ marginTop: 20 }}><Pill full>Continuar</Pill></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} /><span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--slate-500)" }}>ou</span><div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
            </div>
            <GhostPill full leading={<Icon name="apple" size={18} color="var(--fg-1)" />}>Continuar com Apple</GhostPill>
          </div>
        ) : (
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Digite o código</h1>
            <p style={{ margin: "0 0 28px", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center" }}>Enviado para thomas@orbit.app</p>
            <OTP value="142" />
            <div style={{ marginTop: 28 }}><Pill full>Verificar</Pill></div>
            <p style={{ margin: "20px 0 0", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", textAlign: "center" }}>Reenviar código em <span style={{ color: "var(--fg-1)", fontFamily: "var(--font-mono)" }}>0:54</span></p>
          </div>
        )}
      </div>
      <HomeIndicator />
    </Phone>
  );
}
function LoginEmail() { return <Login step={1} />; }
function LoginCode() { return <Login step={2} />; }

// ─── ONBOARDING ─────────────────────────────────────────────
function Onboarding({ step = 1, scheme = "purple", dark = true }) {
  const steps = {
    1: { icon: "orbit", color: "var(--primary)", title: "Bem-vindo ao Orbit", desc: "Construa hábitos que entram em órbita e ficam. Devagar, mas pra valer." },
    2: { icon: "sparkles", color: "var(--violet-400)", title: "Conheça a Astra", desc: "Sua copiloto de hábitos. Converse, peça ideias e deixe que ela organize seu dia." },
    3: { icon: "target", color: "var(--amber-400)", title: "Defina suas metas", desc: "Transforme intenções em metas com prazo — a Astra acompanha o progresso." },
    4: { icon: "flame", color: "var(--orange-500)", title: "Mantenha a sequência", desc: "Cada dia conta. Acumule sequências e use bloqueios quando precisar de folga." },
  };
  const s = steps[step] || steps[1];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", padding: "0 28px 8px" }}>
        <GradientTop height={520} />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ width: 116, height: 116, borderRadius: 999, background: "rgba(127,70,247,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={s.icon} size={54} color={s.color} strokeWidth={1.8} />
          </div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)", textAlign: "center", letterSpacing: "-0.01em" }}>{s.title}</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.55, textWrap: "pretty", maxWidth: 300 }}>{s.desc}</p>
        </div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4].map(i => <span key={i} style={{ height: 7, width: i === step ? 24 : 7, borderRadius: 999, background: i === step ? "var(--primary)" : "rgba(248,250,252,0.18)" }} />)}
          </div>
          <Pill full>{step === 4 ? "Começar" : "Continuar"}</Pill>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}
function OnboardingWelcome() { return <Onboarding step={1} />; }
function OnboardingAstra() { return <Onboarding step={2} />; }
function OnboardingGoals() { return <Onboarding step={3} />; }
function OnboardingStreak() { return <Onboarding step={4} />; }

// ─── TUDO CERTO (You're all set — Create-account) ───────────
function TudoCerto({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 28px" }}>
        <VerifiedBadge size={96} />
        <h1 style={{ margin: "20px 0 0", fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>You're all set!</h1>
        <p style={{ margin: "8px 0 18px", fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5 }}>Everything is real — your habits and progress are already saved.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <Icon name="circle-check" size={22} color="var(--green-500)" />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-200)" }}>Theme personalized</span>
        </div>
        <div style={{ alignSelf: "stretch", marginBottom: 24 }}>
          <InfoCard icon="sparkles" title="Your Pro Trial is Active" desc="Enjoy full Pro access until May 3, 2026." />
        </div>
        <Pill full>Start Using Orbit</Pill>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

Object.assign(window, {
  HabitCard, Inicio, AstraBubble, UserBubble, AstraChat, Agenda, HabitoDetalhe,
  CriarHabito, Conquistas, Login, LoginEmail, LoginCode,
  Onboarding, OnboardingWelcome, OnboardingAstra, OnboardingGoals, OnboardingStreak, TudoCerto,
});
