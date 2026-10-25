import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { vi } from 'vitest'
import postcss from 'postcss'
import { execFileSync } from 'node:child_process'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildComposerChips } from '@orbit/shared/chat'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import type { ComposerProps } from '@orbit/shared/contracts/composer'

export const composerMessages = { current: en }

vi.mock('next-intl', async (importOriginal) => ({
  ...await importOriginal<typeof import('next-intl')>(),
  useTranslations: () => (key: string) => key === 'nav.astra' ? composerMessages.current.nav.astra : key === 'habits.form.suggestDate' ? composerMessages.current.habits.form.suggestDate : key,
}))

export type GeometryScenario = 'idle' | 'oneLine' | 'typing' | 'longText' | 'sending' | 'recording' | 'transcribing' | 'tray1' | 'tray2' | 'tray3' | 'atLimit' | 'offline' | 'retry'

export function geometryProps(scenario: GeometryScenario, messages: typeof en, withOpener: boolean): ComposerProps {
  composerMessages.current = messages
  const state = ['oneLine', 'typing', 'longText', 'tray1', 'tray2', 'tray3', 'retry'].includes(scenario) ? 'idle' : scenario
  return {
    state,
    astraRequestLabel: messages.habits.form.suggestDate,
    ...(state === 'offline' ? { limitReason: messages.shell.composer.offline.reason } : {}),
    ...(state === 'atLimit' ? { limitReason: messages.shell.composer.limit.reason } : {}),
    value: scenario === 'oneLine' ? 'Oi' : scenario === 'typing' ? 'First\nSecond\nThird' : scenario === 'longText' ? 'Long message\n'.repeat(12) : '',
    suggestions: [], words: { ...messages.shell.composer, ...(state === 'offline' ? { placeholder: messages.shell.composer.offline.placeholder } : state === 'atLimit' ? { placeholder: messages.shell.composer.limit.placeholder } : {}) },
    onChangeValue: vi.fn(), onSend: vi.fn(),
    onVoice: vi.fn(), voiceWords: messages.shell.composer.voice,
    onAttachFile: vi.fn(), onAttachImage: vi.fn(),
    attachWords: { ...messages.shell.composer.attach, remove: (name: string) => messages.shell.composer.attach.remove.replace('{name}', name) },
    attachments: Array.from({ length: scenario.startsWith('tray') ? Number(scenario.at(-1)) : 0 }, (_, index) => ({ id: String(index), kind: index === 0 ? 'image' : 'file', name: `attachment-${index}.txt` })),
    onAttachRemove: vi.fn(),
    ...(withOpener ? { onOpenConversation: vi.fn(), conversationLabel: messages.todayAstra.openConversation } : {}),
    ...(scenario === 'retry' ? { onRetry: vi.fn() } : {}),
  } as ComposerProps

}

export const chipScenarios = ['empty', 'pending', 'returning', 'completed', 'habitDetail', 'longTitle', 'unbrokenTitle', 'namedActions'] as const

export function liveChipSuggestions(scenario: typeof chipScenarios[number], messages: typeof en) {
  const surface = scenario === 'habitDetail' ? 'habitDetail' as const : 'today' as const
  const title = scenario === 'unbrokenTitle' ? 'a'.repeat(200) : scenario === 'longTitle'
    ? messages === en ? 'Read a chapter of my favorite book before breakfast' : 'Ler um capítulo do meu livro favorito antes do café da manhã'
    : messages === en ? 'Read' : 'Ler'
  const habits = scenario === 'empty' || scenario === 'habitDetail' ? [] : [createMockHabit({
    title, isOverdue: scenario === 'pending', hasSubHabits: true, isCompleted: scenario === 'completed',
  })]
  const chipState = { surface, status: 'success' as const, habits, totalHabitCount: habits.length,
    profile: createMockProfile({ lastCompletionDate: scenario === 'returning' ? '2026-09-01' : null }),
    now: new Date('2026-09-10T12:00:00Z'), detailHabit: { title, checklistItems: [] } }
  const namedHabit = createMockHabit({ title: 'a'.repeat(200), hasSubHabits: true, isOverdue: true })
  const chips = scenario === 'namedActions' ? [
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, habits: [namedHabit], totalHabitCount: 1, profile: createMockProfile({ lastCompletionDate: '2026-09-01' }) }),
    buildComposerChips({ ...chipState, habits: [{ ...namedHabit, isCompleted: true }], totalHabitCount: 1 }),
    buildComposerChips({ ...chipState, surface: 'progress', habits: [namedHabit], totalHabitCount: 1 }),
  ].flat().filter((chip, index, all) => chip.params && all.findIndex(candidate => candidate.id === chip.id) === index)
    : buildComposerChips(chipState)
  return { surface, suggestions: chips.map(({ id, params }) => {
    const [group, name] = id.split('.')
    const labels: Record<string, string> = messages.shell.composer.chips[group as keyof typeof messages.shell.composer.chips]
    return { id, label: labels[name!]!.replace('{title}', params?.title ?? '') }
  }) }
}

export async function compileComposerGeometry() {
  const source = resolve(process.cwd(), 'app/globals.css')
  const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
  const stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${theme}}`
  const buildOptions = {
    stdin: { contents: `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
      import { Composer } from './components/shell/composer';
      import { ShellWide } from './components/shell/shell-wide';
      import { AstraConversation } from './components/chat/conversation';
      import { createChatThreadScroll } from '@orbit/shared/hooks';
      const props = JSON.parse(document.getElementById('configuration').textContent);
      if (props.clipboardText) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => props.clipboardText } });
      function MountedComposer({ initialProps = props }) {
        const [currentProps, setCurrentProps] = useState(initialProps);
        React.useEffect(() => {
          const update = event => setCurrentProps(event.detail);
          document.addEventListener('composer-test-props', update);
          document.getElementById('root').setAttribute('data-composer-test-ready', '');
          return () => document.removeEventListener('composer-test-props', update);
        }, []);
        const [value, setValue] = useState(initialProps.value);
        const composerProps = {
        ...currentProps, value, onChangeValue: setValue, onSend: () => {},
        onOpenConversation: initialProps.conversationLabel ? () => {} : undefined,
        onAttachFile: initialProps.attachWords ? () => {} : undefined,
        onAttachImage: initialProps.attachWords ? () => {} : undefined,
        onAttachRemove: () => {},
        onVoice: initialProps.voiceWords ? () => {} : undefined,
        attachWords: initialProps.attachWords ? { ...initialProps.attachWords,
          remove: name => initialProps.attachmentRemoveTemplate.replace('{name}', name) } : undefined,
        suggestions: currentProps.suggestions.map(chip => ({ ...chip, onSelect: () => {},
          icon: React.createElement('svg', { width: 20, height: 20, 'aria-hidden': true }) }))
        };
        if (initialProps.testSurface) {
          const composer = React.createElement(Composer, composerProps);
          return React.createElement(ShellWide, { items: [], activeId: 'hoje', navLabel: initialProps.words.actions,
            header: React.createElement('div', { style: { height: 48 } }),
            tabBar: React.createElement('div', { style: { height: 80 } }),
            ...initialProps.testSurface === 'today' ? { compactComposer: composer, fab: React.createElement('div') } : { composer },
          }, React.createElement('div', { style: { height: 900 } }));
        }
        if (initialProps.withMessages === undefined) return React.createElement(Composer, composerProps);
        return React.createElement(AstraConversation, { chat: {
          composerProps, threadScroll: createChatThreadScroll(), chatContainerRef: { current: null },
          messages: initialProps.withMessages ? [{ id: 'previous', role: 'user', content: initialProps.value, timestamp: new Date(0) }] : [],
          activeSteps: [], canShowFollowUps: false, showSuggestions: !initialProps.withMessages,
          isTyping: false, streamingMessageId: null, scrollToBottom: () => {},
        } });
      }
      const root = createRoot(document.getElementById('root'));
      let revision = 0;
      document.addEventListener('composer-test-remount', event => {
        document.getElementById('root').removeAttribute('data-composer-test-ready');
        root.render(React.createElement(MountedComposer, { initialProps: event.detail, key: ++revision }));
      });
      root.render(React.createElement(MountedComposer));`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  }
  const composerScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const options = JSON.parse(process.argv[1]);
    options.plugins = [{ name: 'composer-overlay-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\\/components\\/ui\\/(dropdown-menu|sheet)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
      builder.onResolve({ filter: /^(next-intl|next\\/navigation)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
      builder.onResolve({ filter: /^@\\/components\\/(goals\\/goal-detail-drawer|chat\\/message-bubble|chat\\/prompt-library)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
      builder.onResolve({ filter: /^\\.\\/proactive-action$/ }, args => ({ path: args.path, namespace: 'boundary' }));
      builder.onResolve({ filter: /^(\\.\\/sidebar-account|@sentry\\/nextjs)$/ }, args => ({ path: args.path, namespace: 'sidebar' }));
      builder.onLoad({ filter: /.*/, namespace: 'sidebar' }, () => ({ contents: 'export const SidebarAccount = () => null; export const captureException = () => {};', loader: 'js' }));
      builder.onResolve({ filter: /^@\\/stores\\/auth-store$/ }, args => ({ path: args.path, namespace: 'boundary' }));
      builder.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({ contents:
        'import React from "react"; export const useAuthStore = { getState: () => ({ isAuthenticated: true, user: { userId: "composer-account" } }) }; export const Root = ({children}) => children; export const Trigger = ({children}) => children; export const Content = ({items}) => React.createElement("span", { hidden: true, "data-composer-menu-items": JSON.stringify(items.map(({id,label}) => ({id,label}))) }); export const Sheet = () => null; export const GoalDetailDrawer = () => null; export const MessageBubble = ({message}) => message.content; export const PromptLibrary = () => null; export const ProactiveAction = () => null; export const useRouter = () => ({}); export const useTranslations = () => key => key === \"nav.astra\" ? \"Astra\" : key === \"habits.form.suggestDate\" ? JSON.parse(document.getElementById(\"configuration\").textContent).astraRequestLabel : key;', loader: 'js', resolveDir: process.cwd() }));
    } }];
    const result = await build(options);
    process.stdout.write(result.outputFiles[0].text);
  `, JSON.stringify(buildOptions)], { maxBuffer: 10 * 1024 * 1024 }).toString()
  return { stylesheet, composerScript }
}
