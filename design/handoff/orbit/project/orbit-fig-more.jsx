// ============================================================
// Orbit — Batch 2: more states & areas, same Figma language.
// Astra states · Início states · Metas (goals) · Hábito
// variants · Conquista detalhe · Notificações inbox · Toasts ·
// Celebrações · Diálogos · Modais
// ============================================================

// ─── ASTRA · empty ──────────────────────────────────────────
function AstraEmpty({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Astra" right="help" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 32px", position: "relative" }}>
        <GradientTop height={420} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: "rgba(127,70,247,0.16)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 50px rgba(127,70,247,0.35)" }}>
            <Icon name="sparkles" size={38} color="var(--violet-300)" />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Olá, sou a Astra</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>Sua copiloto de hábitos. Peça pra criar um hábito, resumir seu dia ou planejar a semana.</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", padding: "0 20px 12px", flexShrink: 0 }}>
        {["Criar um hábito", "Resumir meu dia", "Planejar a semana"].map((c, i) => (
          <button key={i} style={{ appearance: "none", border: 0, cursor: "pointer", background: "rgba(248,250,252,0.06)", color: "var(--slate-200)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "10px 16px", borderRadius: 999, boxShadow: "inset 0 0 0 1px var(--hairline)" }}>{c}</button>
        ))}
      </div>
      <ChatInput />
      <HomeIndicator />
    </Phone>
  );
}
function ChatInput({ recording }) {
  return (
    <div style={{ padding: "8px 16px 12px", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minHeight: 50, background: "rgba(248,250,252,0.06)", borderRadius: 999, padding: "0 8px 0 18px", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
        <input placeholder={recording ? "Ouvindo…" : "Fale com a Astra…"} style={{ flex: 1, appearance: "none", border: 0, background: "transparent", outline: "none", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--fg-1)" }} />
        <button style={{ ...iconBtn, width: 34, height: 34 }}><Icon name="mic" size={20} color={recording ? "var(--primary)" : "var(--slate-300)"} /></button>
      </div>
      <button aria-label="Enviar" style={{ appearance: "none", border: 0, cursor: "pointer", width: 50, height: 50, borderRadius: 999, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 20px rgba(127,70,247,0.45)" }}><Icon name="arrow-up" size={22} color="#fff" strokeWidth={2.4} /></button>
    </div>
  );
}

// ─── ASTRA · voice ──────────────────────────────────────────
function AstraVoice({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Astra" right="close" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, position: "relative" }}>
        <GradientTop height={500} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 999, background: "rgba(127,70,247,0.10)" }} />
            <span style={{ position: "absolute", inset: 28, borderRadius: 999, background: "rgba(127,70,247,0.18)" }} />
            <span style={{ width: 80, height: 80, borderRadius: 999, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 50px rgba(127,70,247,0.5)" }}>
              <Icon name="mic" size={34} color="#fff" />
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>Ouvindo…</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", padding: "0 40px" }}>"Cria um hábito de beber água três vezes ao dia"</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 16 }}>
        <button aria-label="Parar" style={{ appearance: "none", border: 0, cursor: "pointer", width: 64, height: 64, borderRadius: 999, background: "rgba(248,250,252,0.08)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1px var(--hairline-strong)" }}>
          <span style={{ width: 20, height: 20, borderRadius: 5, background: "var(--red-400)" }} />
        </button>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── ASTRA · message limit (free) ───────────────────────────
function AstraLimit({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Astra" right="help" />
      <Body style={{ padding: "8px 16px 0" }}>
        <AstraBubble>Você usou suas 5 mensagens gratuitas de hoje. Volte amanhã ou desbloqueie 500/mês com o Premium. ✨</AstraBubble>
        <div style={{ marginTop: 4 }}>
          <InfoCard icon="sparkles" title="500 mensagens com a Astra" desc="Disponível no plano Premium a partir de R$ 8,25/mês." />
        </div>
        <div style={{ marginTop: 14 }}><Pill full leading={<Icon name="crown" size={18} color="#fff" />}>Conhecer o Premium</Pill></div>
      </Body>
      <div style={{ padding: "8px 16px 12px", flexShrink: 0, opacity: 0.45 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 50, background: "rgba(248,250,252,0.06)", borderRadius: 999, padding: "0 18px", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-500)" }}>Limite diário atingido</span>
          <Icon name="lock" size={18} color="var(--slate-500)" />
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── ASTRA · offline ────────────────────────────────────────
function AstraOffline({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Astra" right="help" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 36px" }}>
        <div style={{ width: 80, height: 80, borderRadius: 999, background: "rgba(248,250,252,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="wifi-off" size={34} color="var(--slate-400)" />
        </div>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Você está offline</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5 }}>A Astra precisa de conexão. Seus hábitos continuam funcionando normalmente.</span>
        <div style={{ marginTop: 6 }}><GhostPill leading={<Icon name="rotate-cw" size={18} color="var(--fg-1)" />}>Tentar novamente</GhostPill></div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── INÍCIO · empty ─────────────────────────────────────────
function InicioEmpty({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={240} />
        <div style={{ position: "relative", zIndex: 1, padding: "12px 20px 0" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>Quinta · 21 mai</div>
          <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)" }}>Bom dia, Thomas</h1>
        </div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "64px 36px" }}>
          <Satellite size={104} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Nenhum hábito ainda</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>Comece criando seu primeiro hábito — ou peça à Astra pra montar uma rotina pra você.</span>
          <div style={{ marginTop: 8, alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 12 }}>
            <Pill full leading={<Icon name="sparkles" size={18} color="#fff" />}>Pedir à Astra</Pill>
            <GhostPill full leading={<Icon name="plus" size={18} color="var(--fg-1)" />}>Criar manualmente</GhostPill>
          </div>
        </div>
      </Body>
      <TabBar active="home" />
      <HomeIndicator />
    </Phone>
  );
}

// ─── INÍCIO · loading ───────────────────────────────────────
function InicioLoading({ scheme = "purple", dark = true }) {
  const Sk = ({ w }) => <div style={{ height: 12, width: w, borderRadius: 6, background: "rgba(248,250,252,0.08)" }} />;
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={240} />
        <div style={{ position: "relative", zIndex: 1, padding: "12px 20px 0" }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>Quinta · 21 mai</div>
          <h1 style={{ margin: "4px 0 18px", fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)" }}>Bom dia, Thomas</h1>
          <div style={{ borderRadius: 18, padding: "16px 18px", background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)", display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            <Sk w="40%" /><Sk w="90%" /><Sk w="70%" />
          </div>
          {Array(4).fill(0).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 18, background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)", marginBottom: 10 }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(248,250,252,0.08)", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Sk w="55%" /><Sk w="32%" /></div>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(248,250,252,0.08)" }} />
            </div>
          ))}
        </div>
      </Body>
      <TabBar active="home" />
      <HomeIndicator />
    </Phone>
  );
}

// ─── METAS (goals list) ─────────────────────────────────────
function Metas({ scheme = "purple", dark = true }) {
  const goals = [
    { emoji: "🏃", name: "Correr 100 km", cur: 68, total: 100, unit: "km", tone: "var(--primary)" },
    { emoji: "📚", name: "Ler 12 livros", cur: 7, total: 12, unit: "livros", tone: "var(--cyan-400)" },
    { emoji: "🧘", name: "30 dias de meditação", cur: 18, total: 30, unit: "dias", tone: "var(--amber-500)" },
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={160} />
        <div style={{ position: "relative", zIndex: 1, padding: "8px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 500, color: "var(--fg-1)" }}>Metas</h1>
            <button style={{ ...circBtn, background: "var(--primary)", boxShadow: "0 6px 18px rgba(127,70,247,0.4)" }}><Icon name="plus" size={22} color="#fff" /></button>
          </div>
          {goals.map((g, i) => (
            <div key={i} style={{ borderRadius: 18, padding: "16px 18px", marginBottom: 12, background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{g.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: "var(--fg-1)" }}>{g.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--slate-400)", marginTop: 2 }}>{g.cur} / {g.total} {g.unit}</div>
                </div>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: g.tone }}>{Math.round(g.cur / g.total * 100)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(248,250,252,0.08)", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${g.cur / g.total * 100}%`, background: g.tone, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </Body>
      <TabBar active="home" showFab={false} />
      <HomeIndicator />
    </Phone>
  );
}

// ─── META · detalhe ─────────────────────────────────────────
function MetaDetalhe({ scheme = "purple", dark = true }) {
  const pct = 68, r = 70, c = 2 * Math.PI * r;
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Meta" right="share" />
      <Body pad>
        <div style={{ position: "relative" }}><GradientTop height={260} /></div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0 20px" }}>
          <div style={{ position: "relative", width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(248,250,252,0.08)" strokeWidth="12" />
              <circle cx="90" cy="90" r={r} fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * pct / 100} ${c}`} />
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--fg-1)" }}>68</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)" }}>de 100 km</div>
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)" }}>Correr 100 km</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-300)" }}>No ritmo · faltam 32 km · até 30 jun</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <StatTile emoji="📅" value="40d" label="Restantes" />
          <StatTile emoji="⚡" value="2,1km" label="Por dia" />
        </div>
        <Pill full leading={<Icon name="plus" size={18} color="#fff" />}>Registrar progresso</Pill>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── CRIAR META (sheet) ─────────────────────────────────────
function CriarMeta({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, opacity: 0.4, padding: "0 20px" }}><h1 style={{ fontFamily: "var(--font-sans)", fontSize: 26, color: "var(--fg-1)" }}>Metas</h1></div>
      <Sheet title="Nova meta" footer={<Pill full leading={<Icon name="check" size={18} color="#fff" />}>Criar meta</Pill>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 8 }}>
          <Field label="Nome da meta" value="Correr 100 km" />
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--slate-300)", marginBottom: 8 }}>Tipo</div>
            <div style={{ display: "flex", gap: 10 }}>
              {["Quantidade", "Sequência"].map((t, i) => (
                <span key={i} style={{ flex: 1, textAlign: "center", padding: "13px 0", borderRadius: 14, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, background: i === 0 ? "var(--primary)" : "rgba(248,250,252,0.06)", color: i === 0 ? "#fff" : "var(--slate-300)" }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Alvo" value="100" /></div>
            <div style={{ flex: 1 }}><Field label="Unidade" value="km" /></div>
          </div>
          <Field label="Prazo" value="30/06/2026" trailing={<Icon name="calendar" size={20} color="var(--slate-400)" />} />
        </div>
      </Sheet>
    </Phone>
  );
}

// ─── HÁBITO · checklist ─────────────────────────────────────
function HabitoChecklist({ scheme = "purple", dark = true }) {
  const items = [["Tênis e roupa", true], ["Alongar 5 min", true], ["Correr 3 km", false], ["Beber água", false]];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Hábito" right="share" />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 20px" }}>
          <span style={{ width: 76, height: 76, borderRadius: 22, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>🏃</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>Rotina de corrida</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)" }}>Diário · 2 de 4 concluídos</span>
        </div>
        <div style={{ borderRadius: 18, background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)", overflow: "hidden" }}>
          {items.map(([label, done], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderBottom: i < items.length - 1 ? "1px solid var(--hairline)" : "none" }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: done ? "var(--primary)" : "transparent", boxShadow: done ? "none" : "inset 0 0 0 2px var(--slate-500)" }}>
                {done && <Icon name="check" size={15} color="#fff" strokeWidth={3} />}
              </span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: done ? "var(--slate-400)" : "var(--fg-1)", textDecoration: done ? "line-through" : "none" }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20 }}><Pill full leading={<Icon name="check" size={18} color="#fff" />}>Concluir tudo</Pill></div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── HÁBITO · mau hábito ────────────────────────────────────
function HabitoBad({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Hábito" right="share" />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0 20px" }}>
          <span style={{ width: 76, height: 76, borderRadius: 22, background: "rgba(251,44,54,0.12)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>🚬</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>Evitar tela à noite</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--red-400)" }}>Mau hábito · livre há 9 dias</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <StatTile emoji="🛡️" value="9" label="Dias livre" />
          <StatTile emoji="📉" value="-62%" label="Este mês" />
        </div>
        <div style={{ borderRadius: 16, padding: "16px 18px", marginBottom: 20, background: "rgba(254,154,0,0.10)", boxShadow: "inset 0 0 0 1px rgba(254,154,0,0.28)", display: "flex", gap: 12, alignItems: "center" }}>
          <Icon name="triangle-alert" size={22} color="var(--amber-400)" />
          <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-200)", lineHeight: 1.4 }}>Você costuma recair às sextas. Astra pode te lembrar.</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <GhostPill full style={{ color: "var(--red-400)", boxShadow: "inset 0 0 0 1.5px rgba(251,44,54,0.4)" }}>Registrar recaída</GhostPill>
          <Pill full glow={false} style={{ background: "var(--green-500)" }}>Mantive firme</Pill>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── NOTIFICAÇÕES (inbox) ───────────────────────────────────
function NotificacoesInbox({ scheme = "purple", dark = true }) {
  const items = [
    { icon: "flame", color: "var(--amber-500)", title: "Sequência de 7 dias! 🔥", time: "agora", desc: "Você está pegando o ritmo.", unread: true },
    { icon: "trophy", color: "var(--violet-400)", title: "Conquista desbloqueada", time: "2h", desc: "Madrugador — 5 manhãs seguidas." },
    { icon: "sparkles", color: "var(--violet-400)", title: "Astra preparou seu resumo", time: "8h", desc: "Veja como foi sua semana." },
    { icon: "bell", color: "var(--slate-400)", title: "Lembrete: Meditar", time: "ontem", desc: "Hora de relaxar a mente." },
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Notificações" right="help" />
      <Body>
        <div style={{ height: 4 }} />
        {items.map((n, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "16px 20px", background: n.unread ? "rgba(127,70,247,0.06)" : "transparent" }}>
            <span style={{ width: 42, height: 42, borderRadius: 999, flexShrink: 0, background: "rgba(248,250,252,0.06)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={n.icon} size={20} color={n.color} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>{n.title}</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--slate-500)", flexShrink: 0 }}>{n.time}</span>
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", marginTop: 3, lineHeight: 1.4 }}>{n.desc}</div>
            </div>
          </div>
        ))}
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── TOASTS ─────────────────────────────────────────────────
function ToastFrame({ kind = "success", scheme = "purple", dark = true }) {
  const map = {
    success: { icon: "check", tint: "var(--green-500)", bg: "rgba(0,201,80,0.16)", title: "Hábito concluído", desc: "Sequência de 12 dias 🔥" },
    error: { icon: "x", tint: "var(--red-400)", bg: "rgba(251,44,54,0.16)", title: "Algo deu errado", desc: "Não foi possível salvar. Tente de novo." },
    info: { icon: "bell", tint: "var(--violet-300)", bg: "rgba(127,70,247,0.18)", title: "Lembrete ativado", desc: "Avisaremos às 22:00." },
    queued: { icon: "clock", tint: "var(--slate-300)", bg: "rgba(248,250,252,0.10)", title: "Ação na fila", desc: "Será sincronizada quando voltar online.", action: "Desfazer" },
  };
  const t = map[kind];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ opacity: 0.35, padding: "16px 20px" }}>
          <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, color: "var(--fg-1)" }}>Bom dia, Thomas</h1>
        </div>
        <div style={{ position: "absolute", top: 16, left: 16, right: 16, background: "rgb(15,17,38)", borderRadius: 18, padding: "14px 16px", boxShadow: "0 14px 36px rgba(0,0,0,0.5), inset 0 0 0 1px var(--hairline)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 32, height: 32, borderRadius: 999, background: t.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: t.tint }}><Icon name={t.icon} size={17} strokeWidth={2.4} color={t.tint} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>{t.title}</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--slate-400)", marginTop: 2 }}>{t.desc}</div>
          </div>
          {t.action && <button style={{ appearance: "none", border: 0, background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--violet-300)" }}>{t.action}</button>}
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── CELEBRAÇÕES ────────────────────────────────────────────
function CelebrationFrame({ kind = "all-done", scheme = "purple", dark = true }) {
  const map = {
    "all-done": { emoji: "🎉", title: "Tudo certo por hoje!", desc: "Você concluiu todos os 5 hábitos. Descanse merecido.", cta: "Continuar" },
    streak: { emoji: "🔥", title: "7 dias seguidos!", desc: "Sua maior sequência até agora. Continue assim.", cta: "Compartilhar" },
    level: { emoji: "⭐", title: "Nível 7 alcançado", desc: "Você virou Explorer. Novas conquistas liberadas.", cta: "Ver conquistas" },
    goal: { emoji: "🏆", title: "Meta concluída!", desc: "Correr 100 km — feito. Que tal a próxima?", cta: "Nova meta" },
  };
  const c = map[kind];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 32px" }}>
        <GradientTop height={520} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 120, height: 120, borderRadius: 999, background: "rgba(127,70,247,0.16)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, boxShadow: "0 0 60px rgba(127,70,247,0.4)" }}>{c.emoji}</div>
          <h1 style={{ margin: "12px 0 0", fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>{c.title}</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>{c.desc}</p>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1, padding: "0 24px 12px" }}><Pill full>{c.cta}</Pill></div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── DIÁLOGOS ───────────────────────────────────────────────
function DialogFrame({ variant = "delete", scheme = "purple", dark = true }) {
  const map = {
    delete: { title: "Excluir hábito?", body: "Isso remove \"Corrida matinal\" e todo o histórico. Esta ação não pode ser desfeita.", cancel: "Cancelar", action: "Excluir", danger: true },
    signout: { title: "Sair da conta?", body: "Você precisará entrar novamente para acessar seus hábitos.", cancel: "Cancelar", action: "Sair", danger: false },
    bulk: { title: "Excluir 3 hábitos?", body: "Os hábitos selecionados e seus históricos serão removidos.", cancel: "Cancelar", action: "Excluir", danger: true },
    reset: { title: "Redefinir tudo?", body: "Todos os hábitos, sequências e conquistas serão apagados. Seu perfil permanece.", cancel: "Cancelar", action: "Redefinir", danger: true },
  };
  const d = map[variant];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ opacity: 0.3, padding: "16px 20px" }}><h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, color: "var(--fg-1)" }}>Configurações</h1></div>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 340, background: "rgb(15,17,38)", borderRadius: 24, padding: "24px 22px 18px", boxShadow: "0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1px var(--hairline)" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>{d.title}</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", marginTop: 8, lineHeight: 1.5 }}>{d.body}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button style={{ flex: 1, appearance: "none", border: 0, cursor: "pointer", background: "rgba(248,250,252,0.06)", color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, padding: "13px 0", borderRadius: 999 }}>{d.cancel}</button>
              <button style={{ flex: 1, appearance: "none", border: 0, cursor: "pointer", background: d.danger ? "var(--red-500)" : "var(--primary)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500, padding: "13px 0", borderRadius: 999 }}>{d.action}</button>
            </div>
          </div>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── MODAIS (push / trial / version) ────────────────────────
function PushPrompt({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, opacity: 0.3, padding: "16px 20px" }}><h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, color: "var(--fg-1)" }}>Início</h1></div>
      <Sheet title="Ative as notificações" footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Pill full leading={<Icon name="bell" size={18} color="#fff" />}>Ativar notificações</Pill>
          <GhostPill full>Agora não</GhostPill>
        </div>
      }>
        <p style={{ margin: "0 0 8px", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", lineHeight: 1.5 }}>
          Receba lembretes no horário certo e avisos quando sua sequência estiver em risco. Você pode ajustar tudo depois.
        </p>
      </Sheet>
    </Phone>
  );
}

function TrialExpired({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ opacity: 0.3, padding: "16px 20px" }}><h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, color: "var(--fg-1)" }}>Início</h1></div>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 340, background: "rgb(15,17,38)", borderRadius: 24, padding: "28px 22px 18px", boxShadow: "0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1px var(--hairline)", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, margin: "0 auto 14px", background: "rgba(127,70,247,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="crown" size={30} color="var(--violet-400)" /></div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)" }}>Seu teste acabou</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", marginTop: 8, lineHeight: 1.5 }}>Assine o Premium para manter hábitos ilimitados, a Astra e as metas individuais.</div>
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <Pill full>Assinar o Premium</Pill>
              <GhostPill full>Continuar no plano grátis</GhostPill>
            </div>
          </div>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

function VersionUpdate({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <div style={{ flex: 1, opacity: 0.3, padding: "16px 20px" }}><h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, color: "var(--fg-1)" }}>Início</h1></div>
      <Sheet title="Atualização disponível" footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Pill full leading={<Icon name="download" size={18} color="#fff" />}>Atualizar agora</Pill>
          <GhostPill full>Mais tarde</GhostPill>
        </div>
      }>
        <p style={{ margin: "0 0 12px", fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", lineHeight: 1.5 }}>Versão 2.5.0 com novidades:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
          {["Astra mais rápida e contextual", "Novos temas de cor", "Correções de estabilidade"].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="check" size={16} color="var(--violet-300)" strokeWidth={2.4} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-200)" }}>{f}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </Phone>
  );
}

Object.assign(window, {
  AstraEmpty, ChatInput, AstraVoice, AstraLimit, AstraOffline,
  InicioEmpty, InicioLoading, Metas, MetaDetalhe, CriarMeta,
  HabitoChecklist, HabitoBad, NotificacoesInbox,
  ToastFrame, CelebrationFrame, DialogFrame, PushPrompt, TrialExpired, VersionUpdate,
});
