// ============================================================
// Orbit — Subscription set + Day streak (faithful Figma)
// Upgrade (anual/mensal) · Awaiting · Success · Manage ·
// Downsell · Pricing review · Billing · Sequência (+reminder)
// ============================================================

const SUB_FINE = "A assinatura é renovada automaticamente. Cancele quando quiser com 24h de antecedência para evitar cobranças futuras.";

function Assinatura({ plan = "anual", scheme = "purple", dark = true }) {
  const annual = plan === "anual";
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="" right="help" />
      <Body>
        <GradientTop height={260} />
        <div style={{ position: "relative", zIndex: 1, padding: "0 20px" }}>
          <h1 style={{
            margin: "0 0 22px", fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500,
            color: "var(--fg-1)", lineHeight: 1.3, letterSpacing: "-0.01em", textWrap: "balance",
          }}>Desbloqueie todo o potencial dos seus hábitos com o Premium</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PlanCard name="Anual" badge="Economize 44%" price="R$ 8,25/mês" sub="Cobrança única de R$ 99,90/ano"
              selected={annual} features={["Hábitos ilimitados", "Resumos e retrospectiva", "Metas individuais", "500 mensagens com a Astra", "Temas e personalização"]} />
            <PlanCard name="Mensal" price="R$ 14,90/mês"
              selected={!annual} features={["Hábitos ilimitados", "500 mensagens com a Astra", "Temas e personalização"]} />
          </div>
          <div style={{ marginTop: 22 }}>
            <Pill full leading={<Icon name="sparkles" size={18} color="#fff" />}>Testar 7 dias grátis</Pill>
          </div>
          <p style={{ margin: "16px 4px 8px", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--slate-500)", lineHeight: 1.5, textAlign: "center" }}>{SUB_FINE}</p>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}
function AssinaturaAnual() { return <Assinatura plan="anual" />; }
function AssinaturaMensal() { return <Assinatura plan="mensal" />; }

// ─── Awaiting provider ──────────────────────────────────────
function PagamentoNavegador({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Continuar pagamento" right="close" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "4px 0 0" }}>
        <Icon name="shield-check" size={18} color="var(--green-500)" />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-300)" }}>Sua conexão está segura</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "0 32px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: "rgba(127,70,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <Icon name="external-link" size={28} color="var(--violet-400)" />
        </div>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Conclua sua assinatura no navegador</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>
          Você será direcionado para concluir o pagamento. Se a página não abrir, clique no botão abaixo.
        </span>
        <div style={{ marginTop: 12, alignSelf: "stretch" }}>
          <WhitePill full leading={<Icon name="globe" size={18} color="var(--slate-950)" />}>Ir para o navegador</WhitePill>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── Success ────────────────────────────────────────────────
function AssinaturaSucesso({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="" right="close" />
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column" }}>
        <GradientTop height={500} />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 28px" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 36px rgba(127,70,247,0.5)", marginBottom: 10 }}>
            <Icon name="orbit" size={38} color="#fff" strokeWidth={2} />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-300)" }}>Bem-vindo ao</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>Orbit Premium</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center" }}>Tudo certo com sua assinatura!</span>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "0 20px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="check" size={15} color="#fff" strokeWidth={3} />
            </span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-300)", lineHeight: 1.4 }}>Avise-me quando o período grátis de 7 dias estiver próximo de encerrar.</span>
          </div>
          <Pill full leading={<Icon name="rocket" size={18} color="#fff" />}>Começar a usar</Pill>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── Manage plan ────────────────────────────────────────────
function GerenciarAssinatura({ plan = "Anual", scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Assinatura" right="help" />
      <Body pad>
        <div style={{ borderRadius: 18, background: "rgba(248,250,252,0.05)", boxShadow: "inset 0 0 0 1px var(--hairline)", overflow: "hidden", marginTop: 8 }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--hairline)" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)" }}>Plano</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, color: "var(--fg-1)", marginTop: 3 }}>Premium · {plan}</div>
          </div>
          <div style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)" }}>Faturamento</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 17, color: "var(--fg-1)", marginTop: 3 }}>Renova em 16/{plan === "Anual" ? "04/2027" : "05/2026"}</div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <WhitePill full leading={<Icon name="settings" size={18} color="var(--slate-950)" />}>Gerenciar assinatura</WhitePill>
        </div>
        <div style={{ marginTop: 8, marginLeft: -20, marginRight: -20 }}>
          <ListRow icon="receipt" title="Histórico de faturas" onTap={() => {}} />
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── Downsell ───────────────────────────────────────────────
function Downsell({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="" right="help" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 20px" }}>
        <div style={{ textAlign: "center", padding: "8px 8px 0" }}>
          <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)" }}>Mais valor para seus hábitos</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", lineHeight: 1.5, textWrap: "pretty" }}>
            Aproveite o Premium por apenas R$ 8,25 por mês e economize R$ 78,90 no plano anual.
          </p>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 160, height: 160, borderRadius: 999, background: "radial-gradient(circle, rgba(127,70,247,0.22), rgba(127,70,247,0))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="piggy-bank" size={64} color="var(--violet-400)" strokeWidth={1.6} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 8 }}>
          <Pill full leading={<Icon name="calendar-check" size={18} color="#fff" />}>Mudar para o plano anual</Pill>
          <GhostPill full>Continuar com o mensal</GhostPill>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

// ─── Pricing review (bottom sheet over upgrade) ─────────────
function PricingReview({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="" right="help" />
      <Body>
        <GradientTop height={260} />
        <div style={{ position: "relative", zIndex: 1, padding: "0 20px", opacity: 0.5 }}>
          <h1 style={{ margin: "0 0 22px", fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)", lineHeight: 1.3 }}>Desbloqueie todo o potencial dos seus hábitos com o Premium</h1>
          <PlanCard name="Anual" badge="Economize 44%" price="R$ 8,25/mês" sub="Cobrança única de R$ 99,90/ano" selected features={["Hábitos ilimitados", "Resumos e retrospectiva"]} />
        </div>
      </Body>
      <Sheet title="Plano anual" footer={<Pill full leading={<Icon name="sparkles" size={18} color="#fff" />}>Testar 7 dias grátis</Pill>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 500, color: "var(--fg-1)" }}>7 dias grátis</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", marginTop: 3 }}>Período de teste começa hoje</div>
          </div>
          <div style={{ height: 1, background: "var(--hairline)" }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--fg-1)" }}>R$ 99,90/ano</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--slate-400)", marginTop: 3 }}>Cobrança em 15 de abril</div>
          </div>
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--slate-500)", lineHeight: 1.5 }}>{SUB_FINE}</p>
        </div>
      </Sheet>
    </Phone>
  );
}

// ─── Billing history ────────────────────────────────────────
function HistoricoFaturas({ scheme = "purple", dark = true }) {
  const rows = [
    ["16 abr 2026", "R$ 99,90", "Premium · Anual"],
    ["16 abr 2025", "R$ 99,90", "Premium · Anual"],
    ["16 mar 2025", "R$ 14,90", "Premium · Mensal"],
    ["16 fev 2025", "R$ 14,90", "Premium · Mensal"],
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Histórico de faturas" right={null} />
      <Body>
        <div style={{ height: 8 }} />
        {rows.map((r, i) => (
          <ListRow key={i} icon="receipt" title={r[1]} desc={`${r[0]} · ${r[2]}`}
            trailing={<Icon name="download" size={20} color="var(--slate-400)" />} chevron={false} onTap={() => {}} />
        ))}
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── Streak month calendar ──────────────────────────────────
function StreakCalendar({ runEnd = 7, freezes = [4, 5], today = 7, broken = false }) {
  const startCol = 3, days = 30; // April 2026 starts Wednesday
  const cells = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const wk = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  return (
    <div style={{ borderRadius: 18, padding: "16px 14px 18px", background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}>
      <div style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 500, color: "var(--fg-1)", marginBottom: 14 }}>Abril 2026</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 8 }}>
        {wk.map(w => <div key={w} style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: "var(--slate-500)", letterSpacing: "0.04em" }}>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 4 }}>
        {cells.map((d, i) => {
          if (d == null) return <div key={i} style={{ height: 42 }} />;
          const inRun = !broken && d >= 1 && d <= runEnd;
          const isFreeze = freezes.includes(d);
          const isToday = d === today;
          const first = d === 1, last = d === runEnd;
          return (
            <div key={i} style={{ height: 42, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {inRun && <span aria-hidden style={{ position: "absolute", top: 7, bottom: 7, left: first ? 5 : 0, right: last ? 5 : 0, background: "rgba(254,154,0,0.16)", borderTopLeftRadius: first ? 999 : 0, borderBottomLeftRadius: first ? 999 : 0, borderTopRightRadius: last ? 999 : 0, borderBottomRightRadius: last ? 999 : 0 }} />}
              <span style={{
                position: "relative", zIndex: 1, width: 28, height: 28, borderRadius: 999,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: isToday ? 700 : 500, fontVariantNumeric: "tabular-nums",
                color: isToday ? "var(--fg-1)" : inRun ? "var(--amber-500)" : "var(--slate-300)",
                background: isToday ? "rgba(248,250,252,0.10)" : "transparent",
                boxShadow: isToday ? "inset 0 0 0 1.5px var(--slate-500)" : "none",
              }}>{d}</span>
              {isFreeze && (
                <span aria-hidden style={{ position: "absolute", top: 3, zIndex: 2, width: 17, height: 17, borderRadius: "50% 50% 50% 0", transform: "rotate(45deg)", background: "var(--status-frozen)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                  <span style={{ transform: "rotate(-45deg)", fontSize: 9, color: "#04212b" }}>❄</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sequencia({ scheme = "purple", dark = true, days = 7, reminder = false, broken = false }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Sequência" right="share" />
      <Body pad>
        {reminder && (
          <div style={{ borderRadius: 16, padding: "14px 16px", marginBottom: 16, background: "var(--primary)", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 24px rgba(127,70,247,0.4)" }}>
            <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "#fff", lineHeight: 1.35 }}>
              {broken ? "Complete um hábito para começar sua sequência." : "Complete um hábito e retome sua sequência."}
            </span>
            <button style={{ appearance: "none", border: 0, cursor: "pointer", background: "#fff", color: "var(--slate-950)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "9px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>Ver hábitos</button>
          </div>
        )}
        {!reminder && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 0 22px" }}>
            <span style={{ fontSize: 36 }}>{broken ? "🌑" : "🔥"}</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.02em" }}>{days} dias</span>
          </div>
        )}
        <StreakCalendar runEnd={broken ? 0 : days} freezes={broken ? [] : [4, 5]} today={broken ? 8 : 7} broken={broken} />
        <div style={{ borderRadius: 18, marginTop: 16, background: "rgba(248,250,252,0.04)", boxShadow: "inset 0 0 0 1px var(--hairline)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--hairline)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}><Icon name="flame" size={20} color="var(--amber-500)" />Maior sequência</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>{broken ? "0 dias" : "7 dias"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--fg-1)" }}><Icon name="snowflake" size={20} color="var(--status-frozen)" />Bloqueio de sequência <Icon name="info" size={15} color="var(--slate-500)" /></span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)" }}>{broken ? "0/3" : "1/3"}</span>
          </div>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}
function SequenciaReminder() { return <Sequencia reminder days={7} />; }
function SequenciaBroken() { return <Sequencia reminder broken days={0} />; }

Object.assign(window, {
  Assinatura, AssinaturaAnual, AssinaturaMensal, PagamentoNavegador, AssinaturaSucesso,
  GerenciarAssinatura, Downsell, PricingReview, HistoricoFaturas,
  StreakCalendar, Sequencia, SequenciaReminder, SequenciaBroken,
});
