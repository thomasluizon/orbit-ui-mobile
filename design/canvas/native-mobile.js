/* Drawing primitives for the native mobile amendment. Product implementation has its own tickets. */
window.OrbitNativeMobile = (() => {
  const node = (tag, props, ...children) => React.createElement(tag,
    tag === 'button' || tag === 'a' ? { ...props, className: ['native-control', props?.className].filter(Boolean).join(' '),
      style: { transition: 'background-color var(--dur-fast) var(--ease-standard)', ...props?.style } } : props, ...children);
  const icon = (name, size = 24) => node(window.OrbitDesignSystem_918bd5.Icon, { name, size });
  const button = { minHeight: 44, minWidth: 44, padding: '4px 8px', border: 0,
    borderRadius: 'var(--r-pill)', background: 'transparent', color: 'var(--fg-2)',
    font: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  let rootScroller;
  window.addEventListener('scroll', (event) => { if (event.target instanceof Element && event.target.querySelector('[data-native-scroll]')) rootScroller = event.target; }, true);
  const words = () => document.querySelector('[lang="en"]')
    ? { attach: 'Attach', file: 'Document', image: 'Photo', voice: 'Voice', bell: 'Notifications' }
    : { attach: 'Anexar', file: 'Documento', image: 'Foto', voice: 'Voz', bell: 'Avisos' };
  function BellRow({ children, leading, count = 3 }) {
    const t = words();
    return node('div', { className: 'native-bell-row', style: { display: 'flex', alignItems: 'center',
      minHeight: 48, gap: 8, paddingInline: 16 } }, leading,
      node('div', { style: { marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 } }, children,
      node('a', { href: 'Orbit Avisos.dc.html', 'aria-label': t.bell, style: { ...button, gap: 4 } },
        icon('bell'), count > 0 ? node('span', { style: { fontSize: 12, padding: '4px 8px',
          borderRadius: 'var(--r-pill)', background: 'var(--fg-1)', color: 'var(--bg)' } }, count > 9 ? '9+' : count) : null)));
  }
  /* Opens the conversation specimen; this drawing navigation is not a product route. */
  function AstraRow({ current = false, onOpen = () => window.location.assign('Orbit Astra Conversation.dc.html') }) {
    return node(React.Fragment, null,
      node('style', null, '.native-astra-row:hover,.native-astra-row:active{background:var(--bg-hover)}.native-astra-row:focus-visible{outline:2px solid var(--primary);outline-offset:2px}'),
      node('button', { type: 'button', className: 'native-astra-row', 'aria-expanded': current,
        onClick: onOpen, style: { ...button, width: '100%', minHeight: 48, borderRadius: 12,
          paddingInline: 12, gap: 12, justifyContent: 'flex-start', fontSize: 14, fontWeight: 500,
          color: current ? 'var(--primary-soft)' : 'var(--fg-3)' } },
        node('span', { 'aria-hidden': true, style: { display: 'flex', color: current ? 'var(--primary)' : 'inherit' } },
          node(window.OrbitDesignSystem_918bd5.AstraGlyph, { size: 20 })),
        node('span', { translate: 'no' }, 'Astra')));
  }
  function Composer(props) {
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    const t = words();
    const blocked = ['atLimit', 'offline', 'busy', 'sending', 'transcribing'].includes(props.state);
    const recording = props.state === 'recording';
    const value = props.value === undefined ? draft : props.value;
    const send = props.onRetry || props.onSend;
    const reason = props.state === 'atLimit' ? props.limitReason
      : props.state === 'offline' ? props.words.offlineReason : props.state === 'busy' ? props.words.busyReason : null;
    const menu = [props.onAttach && { label: t.image, run: () => props.onAttach('image') },
      props.onAttach && { label: t.file, run: () => props.onAttach('file') },
      props.onVoice && { label: t.voice, run: props.onVoice }].filter(Boolean);
    return node('div', { className: 'native-composer', style: { borderTop: '1px solid var(--hairline)', padding: props.padding ?? 8 } },
      props.chips?.length ? node('div', { 'aria-label': props.words.chipsLabel, style: { display: 'flex',
        gap: 8, overflowX: 'auto', paddingBottom: 8 } }, props.chips.map((chip, index) => node('button', {
        key: chip, type: 'button', style: { ...button, whiteSpace: 'nowrap', flexShrink: 0 },
        onClick: () => props.onChipPress?.(chip, index) }, chip))) : null,
      reason ? node('p', { role: 'status', style: { padding: 8, fontSize: 14 } }, reason, props.limitRecovery) : null,
      node('div', { style: { borderRadius: 28, background: 'var(--bg-field)', padding: 4,
        boxShadow: 'inset 0 0 0 1px var(--border-control)' } },
        props.attachments?.length ? node('div', { style: { padding: 8, display: 'grid', gap: 8 } },
          props.attachments.slice(0, 3).map((attachment) => node('div', { key: attachment.id, style: { display: 'flex', gap: 8 } },
            node('button', { type: 'button', style: { ...button, flex: 1, minWidth: 0 },
              onClick: () => window.alert(attachment.name) }, node('span', { className: 'native-typed' }, attachment.name)),
            node('button', { type: 'button', 'aria-label': props.attachWords.remove(attachment.name),
              style: button, onClick: () => props.onAttachRemove?.(attachment.id) }, icon('x'))))) : null,
        node('div', { style: { display: 'flex', alignItems: 'center', minHeight: 48 } },
          props.onOpen ? node('button', { type: 'button', style: button, 'aria-label': props.words.open,
            onClick: props.onOpen }, node(window.OrbitDesignSystem_918bd5.AstraGlyph, { size: 24 })) : null,
          recording ? node(React.Fragment, null, node('span', { style: { flex: 1, fontSize: 14 } }, props.voiceWords.listening, ' 00:12'),
            node('button', { type: 'button', style: button, 'aria-label': props.voiceWords.stop,
              onClick: props.onVoice }, icon('player-stop')))
            : props.state === 'transcribing' ? node('span', { style: { flex: 1, fontSize: 14 } }, props.voiceWords.transcribing)
              : node('textarea', { rows: 1, value, disabled: blocked, placeholder: props.words.placeholder,
                'aria-label': props.words.fieldLabel, onFocus: props.onOpen, onChange: (event) => {
                  const next = event.target.value;
                  setDraft(next); props.onChange?.(next);
                  event.target.style.height = 'auto';
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
                }, style: { flex: 1, minWidth: 0, border: 0, resize: 'none', background: 'transparent',
                  color: 'var(--fg-1)', font: 'inherit', fontSize: 16, lineHeight: '24px', maxHeight: 120, padding: '4px 8px' } }),
          node('button', { type: 'button', style: button, 'aria-label': t.attach, disabled: blocked,
            'aria-expanded': open, onClick: () => setOpen(!open) }, icon('plus')),
          node('button', { type: 'button', className: 'native-send', 'aria-label': props.onRetry ? props.words.retry : props.words.send,
            disabled: blocked && !props.onRetry, onClick: send,
            style: { ...button, background: 'var(--primary)', color: 'var(--fg-on-primary)' } },
            icon(props.onRetry ? 'refresh' : props.state === 'sending' ? 'loader' : 'arrow-up')))),
      node(window.OrbitDesignSystem_918bd5.Menu, { open, title: t.attach, onClose: () => setOpen(false),
        items: menu.map((entry, index) => ({ id: String(index), label: entry.label })),
        onSelect: (id) => { setOpen(false); menu[Number(id)].run(); } }));
  }
  function TabBar({ items, activeId, onSelect }) {
    return node('nav', { style: { display: 'flex', minHeight: 80, paddingBottom: 'env(safe-area-inset-bottom)',
      borderTop: '1px solid var(--hairline)', background: 'var(--bg)' } }, items.map((item) => node('button', {
        key: item.id, type: 'button', className: 'native-tab', 'aria-current': item.id === activeId ? 'page' : undefined,
        onClick: () => { if (item.id === activeId) rootScroller?.scrollTo({ top: 0 }); onSelect?.(item.id); },
        style: { ...button, flex: 1, flexDirection: 'column', gap: 4, paddingBlock: 14, paddingInline: 0,
          color: item.id === activeId ? 'var(--primary-soft)' : 'var(--fg-3)' } },
        node('span', { className: 'native-tab-indicator', style: { width: 56, height: 32, borderRadius: 'var(--r-pill)',
          display: 'grid', placeItems: 'center', color: item.id === activeId ? 'var(--primary)' : 'inherit' } },
          icon(item.id === activeId ? `${item.icon}-filled` : item.icon)),
        node('span', { style: { fontSize: 12, fontWeight: 500, lineHeight: '16px', whiteSpace: 'nowrap' } }, item.label))));
  }
  function StatTile({ label, value, state, emptyLabel, loadingLabel }) {
    return node('div', { style: { container: 'native-stat / inline-size', fontSize: 'var(--fs-sm)', minWidth: 0, padding: 16, borderRadius: 20, background: 'var(--bg-card)',
      boxShadow: 'inset 0 0 0 1px var(--hairline)', display: 'flex', flexDirection: 'column', gap: 8 } },
      node('span', { style: { fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', fontWeight: 600,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 } }, state === 'loading' ? loadingLabel : state === 'empty' ? emptyLabel : value),
      node('span', { className: 'native-stat-caption', style: { fontSize: 'var(--fs-sm)', lineHeight: 20 / 14, color: 'var(--fg-2)' } }, label));
  }
  function PlainFigure(props) {
    return node('div', { style: { display: 'grid', gap: 8, minWidth: 0 } },
      node('span', { style: { fontFamily: 'var(--font-display)', fontSize: props.state === 'loading' || props.state === 'empty' ? 'var(--fs-sm)' : 'var(--fs-xl)', fontVariantNumeric: 'tabular-nums' } },
        props.state === 'loading' ? props.loadingLabel : props.state === 'empty' ? props.emptyLabel : props.value),
      node('span', { className: 'native-figure-caption', style: { fontSize: 'var(--fs-sm)', lineHeight: 20 / 14 } }, props.label));
  }
  function EventRow({ title, time, source }) {
    const [expanded, setExpanded] = React.useState(false);
    return node('button', { type: 'button', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded),
      style: { ...button, minHeight: 68, width: '100%', flexDirection: 'column', alignItems: 'stretch',
        gap: 4, padding: '12px 16px', borderRadius: 12, textAlign: 'start' } },
      node('span', { className: expanded ? undefined : 'native-typed', style: { fontSize: 16, overflowWrap: 'anywhere' } }, title),
      node('span', { style: { fontSize: 12, color: 'var(--fg-3)' } }, time, source ? ` · ${source}` : ''));
  }
  function HabitDayRow({ label, description, checked, onChange, readOnly, trailing }) {
    return node('div', { style: { display: 'flex', alignItems: 'center', minHeight: 68, gap: 12 } },
      node(EventRow, { title: label, time: description }),
      readOnly ? trailing : node('button', { type: 'button', role: 'checkbox', 'aria-checked': checked, 'aria-label': label,
        style: button, onClick: () => onChange?.(!checked) }, icon(checked ? 'circle-check' : 'circle')));
  }
  function ListRow(props) {
    const body = node(props.readOnly ? 'div' : 'button', { type: props.readOnly ? undefined : 'button',
      onClick: props.onClick, style: { ...button, flex: 1, minWidth: 0, width: '100%', justifyContent: 'flex-start',
        minHeight: props.description || props.value ? 68 : 52, gap: 12, padding: '12px 16px', borderRadius: 12,
        color: props.danger ? 'var(--status-bad-text)' : 'var(--fg-1)', textAlign: 'start' } },
      props.icon ? node('span', { 'aria-hidden': true, style: { flexShrink: 0 } }, icon(props.icon)) : null,
      node('span', { style: { display: 'grid', gap: 4, minWidth: 0, flex: 1 } },
        node('span', { className: props.typedTitle && !props.fullText ? 'native-typed' : undefined,
          style: { fontSize: 17, whiteSpace: props.typedTitle ? 'normal' : 'nowrap', overflowWrap: props.fullText ? 'anywhere' : undefined } }, props.title),
        props.description ? node('span', { className: props.fullText ? undefined : 'native-typed', style: { fontSize: 14, color: 'var(--fg-3)', overflowWrap: 'anywhere' } }, props.description) : null,
        props.value ? node('span', { style: { fontSize: 12, color: 'var(--fg-3)', whiteSpace: 'nowrap' } }, props.value) : null),
      props.trailing, props.chevron !== false && !props.readOnly ? icon('chevron-right') : null);
    return node('div', { style: { display: 'flex', alignItems: 'center' } }, body,
      props.action ? node('button', { type: 'button', 'aria-label': props.action.label,
        style: button, onClick: props.action.onPress }, icon(props.action.icon)) : null);
  }
  function NavHeader({ title, onBack, backLabel, trailing }) {
    return node('div', { style: { display: 'flex', alignItems: 'center', minHeight: 56, gap: 8, padding: 8 } },
      onBack ? node('button', { type: 'button', 'aria-label': backLabel, onClick: onBack, style: button }, icon('chevron-left')) : null,
      node('span', { style: { flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' } }, title), trailing);
  }
  function Badge({ children }) {
    return node('span', { style: { borderRadius: 8, padding: '4px 8px', fontFamily: 'var(--font-mono)',
      fontSize: 12, fontWeight: 500, background: 'var(--bg-well)', color: 'var(--fg-1)' } }, children);
  }
  function SegmentedControl({ options, value, onChange, label }) {
    return node('div', { role: 'group', 'aria-label': label, style: { display: 'flex', flexWrap: 'wrap',
      width: '100%', gap: 4, padding: 4, borderRadius: 12, background: 'var(--bg-well)' } },
      options.map((option) => node('button', { key: option.id, type: 'button', 'aria-pressed': value === option.id,
        disabled: option.disabled, onClick: () => { if (option.id !== value) onChange(option.id); },
        style: { ...button, flex: '1 0 auto', whiteSpace: 'nowrap', fontSize: 14,
          boxShadow: value === option.id ? 'inset 0 0 0 2px var(--primary)' : undefined } }, option.label)));
  }
  function BackToTop() {
    const [visible, setVisible] = React.useState(false);
    React.useEffect(() => {
      let previous = 0;
      const onScroll = (event) => {
        if (!(event.target instanceof Element) || !event.target.querySelector('[data-native-scroll]')) return;
        setVisible(event.target.scrollTop > event.target.clientHeight && event.target.scrollTop < previous);
        previous = event.target.scrollTop;
      };
      window.addEventListener('scroll', onScroll, true);
      return () => window.removeEventListener('scroll', onScroll, true);
    }, []);
    return visible ? node('button', { type: 'button', style: { ...button, position: 'sticky', top: 8,
      alignSelf: 'center', gap: 8, background: 'var(--bg-elev)' }, onClick: () => rootScroller?.scrollTo({ top: 0 }) },
      icon('arrow-up'), words().bell === 'Notifications' ? 'Top' : 'Topo') : null;
  }
  return { AstraRow, BellRow, Composer, TabBar, StatTile, PlainFigure, EventRow, HabitDayRow, ListRow, NavHeader, Badge, SegmentedControl, BackToTop };
})();
