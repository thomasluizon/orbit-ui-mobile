// ============================================================
// Orbit — Account & settings screens (faithful Figma recreation)
// Profile · Configurações · Integrações · Informações pessoais ·
// Notificações · Redefinir/Desativar conta · Preferências +
// Theme sheet · Sobre · Orbit Astra · Memórias
// ============================================================

// ─── PROFILE (Newbie / Starter / Premium) ──────────────────
function Profile({ plan = "premium", scheme = "purple", dark = true }) {
  const premium = plan === "premium";
  const stats = {
    newbie:  { streak: "0 dias", ach: "0" },
    starter: { streak: "1 dia",  ach: "4" },
    premium: { streak: "7 dias", ach: "12" },
  }[plan];
  const level = premium ? "Explorer" : "Starter";
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <Body>
        <GradientTop height={300} />
        <div style={{ position: "relative", zIndex: 1, padding: "0 16px" }}>
          {/* identity */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 18 }}>
            {premium && <Badge tone="violet">Premium</Badge>}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 32, fontWeight: 500, color: "var(--fg-1)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>Thomas</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--slate-300)" }}>{level}</span>
          </div>
          {/* stat tiles */}
          <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
            <StatTile emoji="🔥" value={stats.streak} label="Sequência" />
            <StatTile emoji="🏆" value={stats.ach} label="Conquistas" />
          </div>
        </div>

        {/* list */}
        <div style={{ marginTop: 24 }}>
          {premium && <ListRow icon="sparkles" title="Orbit Astra" onTap={() => {}} />}
          <ListRow icon="credit-card" title="Assinatura" onTap={() => {}} />
          <ListRow icon="settings" title="Configurações" onTap={() => {}} />
          <ListRow icon="user-plus" title="Convidar amigos" onTap={() => {}} />
          <ListRow icon="circle-help" title="Ajuda" onTap={() => {}} />
          <ListRow icon="log-out" title="Sair" chevron={false} onTap={() => {}} />
        </div>
        <div style={{ height: 12 }} />
      </Body>
      <TabBar active="profile" />
      <HomeIndicator />
    </Phone>
  );
}
function ProfileNewbie() { return <Profile plan="newbie" />; }
function ProfileStarter() { return <Profile plan="starter" />; }
function ProfilePremium() { return <Profile plan="premium" />; }

// ─── CONFIGURAÇÕES (settings menu) ──────────────────────────
function Configuracoes({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Configurações" right="help" />
      <Body>
        <div style={{ height: 8 }} />
        <ListRow icon="sliders-horizontal" title="Preferências" desc="Personalize tema e opções de exibição" onTap={() => {}} />
        <ListRow icon="plug" title="Integrações" desc="Gerencie aplicações associadas à sua conta" onTap={() => {}} />
        <ListRow icon="user-round" title="Informações pessoais" desc="Atualize seus dados cadastrais" onTap={() => {}} />
        <ListRow icon="bell" title="Notificações" desc="Configure alertas e comunicações" onTap={() => {}} />
        <ListRow icon="info" title="Sobre o app" desc="Versão, termos e política de privacidade" onTap={() => {}} />
        <div style={{ height: 18 }} />
        <ListRow icon="rotate-ccw" title="Redefinir conta" onTap={() => {}} />
        <ListRow icon="user-x" title="Desativar conta" onTap={() => {}} danger />
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── INTEGRAÇÕES ────────────────────────────────────────────
function Integracoes({ scheme = "purple", dark = true }) {
  const apps = [
    { icon: "calendar", name: "Google Calendar", desc: "Conectado · sam@gmail.com", on: true },
    { icon: "apple", name: "Apple Saúde", desc: "Sincronize treinos e atividades", on: false },
    { icon: "watch", name: "Wear OS", desc: "Complete hábitos pelo relógio", on: false },
  ];
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Integrações" right="help" />
      <Body>
        <SectionTitle bottom={8}>Conectados</SectionTitle>
        {apps.map((a, i) => <SwitchRow key={i} icon={a.icon} title={a.name} desc={a.desc} on={a.on} />)}
        <SectionTitle>Importar</SectionTitle>
        <ListRow icon="download" title="Importar de outro app" desc="Traga seus hábitos de outros aplicativos" onTap={() => {}} />
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── INFORMAÇÕES PESSOAIS (form) ────────────────────────────
function InformacoesPessoais({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Informações pessoais" right={null} />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0 24px" }}>
          <div style={{
            width: 88, height: 88, borderRadius: 999, background: "rgba(127,70,247,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--violet-300)",
            position: "relative",
          }}>
            T
            <span style={{ position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 999, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 3px var(--bg)" }}>
              <Icon name="camera" size={15} color="#fff" />
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="Nome" value="Thomas Müller" />
          <Field label="E-mail" value="thomas@orbit.app" />
          <Field label="Telefone" value="+55 11 99999-0000" />
          <Field label="Data de nascimento" value="14/03/1996" />
        </div>
        <div style={{ marginTop: 28 }}><Pill full>Salvar alterações</Pill></div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── NOTIFICAÇÕES ───────────────────────────────────────────
function Notificacoes({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Notificações" right="help" />
      <Body>
        <div style={{ height: 8 }} />
        <SwitchRow icon="trophy" title="Progresso" desc="Receba avisos sobre conquistas, progresso e sequência de hábitos" on />
        <SwitchRow icon="megaphone" title="Atualizações e novidades" desc="Receba notificações sobre atualizações do aplicativo" on={false} />
        <SwitchRow icon="clock" title="Lembretes diários" desc="Um empurrãozinho no horário que você escolher" on />
        <SwitchRow icon="flame" title="Sequência em risco" desc="Avise quando sua sequência estiver prestes a quebrar" on />
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── REDEFINIR CONTA ────────────────────────────────────────
function RedefinirConta({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Redefinir conta" right={null} />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "28px 0 20px" }}>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: "rgba(254,154,0,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="rotate-ccw" size={34} color="var(--amber-400)" />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Começar do zero</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>
            Isso apaga todos os hábitos, sequências e conquistas. Seu perfil e assinatura permanecem.
          </span>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          <Pill full glow={false} style={{ background: "var(--amber-500)", color: "var(--slate-950)" }}>Redefinir tudo</Pill>
          <GhostPill full>Cancelar</GhostPill>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── DESATIVAR CONTA ────────────────────────────────────────
function DesativarConta({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Desativar conta" right={null} />
      <Body pad>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "28px 0 20px" }}>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: "rgba(251,44,54,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="triangle-alert" size={34} color="var(--red-400)" />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Desativar sua conta</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>
            Sua conta ficará inativa e seus dados serão removidos após 30 dias. Esta ação não pode ser desfeita depois disso.
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          <Field label="Confirme sua senha" value="" type="password" placeholder="••••••••" />
        </div>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Pill full glow={false} style={{ background: "var(--red-500)" }}>Desativar conta</Pill>
          <GhostPill full>Cancelar</GhostPill>
        </div>
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── PREFERÊNCIAS ───────────────────────────────────────────
function Preferencias({ scheme = "purple", dark = true, sheet = false }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Preferências" right="help" />
      <Body>
        <SectionTitle bottom={4}>Geral</SectionTitle>
        <ListRow icon="palette" title="Tema" desc="Orbit" badge={<Badge tone="violet">Premium</Badge>} chevron={false} onTap={() => {}} />
        <ListRow icon="languages" title="Idioma" desc="Português" onTap={() => {}} />
        <ListRow icon="volume-2" title="Voz" desc="Inglês (Padrão)" onTap={() => {}} />
        <SectionTitle bottom={4}>Data e hora</SectionTitle>
        <ListRow icon="calendar" title="Início da semana" desc="Segunda-feira" onTap={() => {}} />
        <ListRow icon="clock" title="Formato da hora" desc="24h" onTap={() => {}} />
        <SectionTitle bottom={4}>Sons</SectionTitle>
        <SwitchRow icon="music" title="Efeitos sonoros" on={false} />
        <div style={{ height: 16 }} />
      </Body>
      <HomeIndicator />
      {sheet && <ThemeSheet />}
    </Phone>
  );
}
function PreferenciasSheet() { return <Preferencias sheet />; }

function ThemeSheet() {
  const themes = [
    { name: "Orbit (Padrão)", dot: "var(--violet-500)", sel: true },
    { name: "Sky", dot: "var(--cyan-400)" },
    { name: "Rose", dot: "rgb(255,32,86)" },
    { name: "Amber", dot: "var(--amber-500)" },
    { name: "Lime", dot: "rgb(154,230,0)" },
    { name: "Ocean", dot: "var(--blue-500, rgb(43,127,255))" },
  ];
  return (
    <Sheet title="Tema" footer={<WhitePill full leading={<Icon name="check" size={18} color="var(--slate-950)" />}>Salvar alteração</WhitePill>}>
      {themes.map((t, i) => (
        <RadioRow key={i} label={t.name} selected={t.sel} dot={t.dot} divider={i < themes.length - 1} />
      ))}
    </Sheet>
  );
}

// ─── SOBRE O APP ────────────────────────────────────────────
function Sobre({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Sobre o app" right={null} />
      <Body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 0 20px" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 30px rgba(127,70,247,0.4)" }}>
            <Icon name="orbit" size={38} color="#fff" strokeWidth={2} />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)" }}>Orbit</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--slate-400)" }}>Versão 2.4.1 (build 318)</span>
        </div>
        <ListRow icon="file-text" title="Termos de uso" onTap={() => {}} />
        <ListRow icon="shield" title="Política de privacidade" onTap={() => {}} />
        <ListRow icon="star" title="Avaliar o Orbit" onTap={() => {}} />
        <ListRow icon="mail" title="Fale conosco" desc="suporte@orbit.app" onTap={() => {}} />
        <ListRow icon="code" title="Licenças de código aberto" onTap={() => {}} />
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── ORBIT ASTRA (settings) ─────────────────────────────────
function AstraSettings({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Orbit Astra" right="help" />
      <Body>
        <SectionTitle bottom={4}>Personalização</SectionTitle>
        <ListRow icon="palette" title="Tom e estilo" desc="Padrão" onTap={() => {}} />
        <SectionTitle bottom={4}>Inteligência</SectionTitle>
        <SwitchRow icon="satellite" title="Satélite" desc="Astra acompanha seus hábitos e identifica as prioridades do seu dia" on />
        <SwitchRow icon="brain" title="Memória" desc="Astra lembra de suas conversas para gerar respostas personalizadas" on />
        <ListRow icon="database" title="Gerenciar memórias" badge={<Badge tone="violet">Premium</Badge>} onTap={() => {}} />
      </Body>
      <HomeIndicator />
    </Phone>
  );
}

// ─── MEMÓRIAS (empty) ───────────────────────────────────────
function Memorias({ scheme = "purple", dark = true }) {
  return (
    <Phone scheme={scheme} dark={dark}>
      <StatusBar />
      <NavHeader title="Memórias" right="help" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "40px 36px" }}>
        <Satellite size={104} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 500, color: "var(--fg-1)", textAlign: "center" }}>Nada em órbita ainda</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--slate-300)", textAlign: "center", lineHeight: 1.5, textWrap: "pretty" }}>
          Que tal começar uma conversa agora? Suas memórias salvas pela Astra aparecerão aqui.
        </span>
        <div style={{ marginTop: 8, alignSelf: "stretch" }}>
          <Pill full leading={<Icon name="sparkles" size={18} color="#fff" />}>Começar conversa</Pill>
        </div>
      </div>
      <HomeIndicator />
    </Phone>
  );
}

Object.assign(window, {
  Profile, ProfileNewbie, ProfileStarter, ProfilePremium,
  Configuracoes, Integracoes, InformacoesPessoais, Notificacoes,
  RedefinirConta, DesativarConta, Preferencias, PreferenciasSheet, ThemeSheet,
  Sobre, AstraSettings, Memorias,
});
