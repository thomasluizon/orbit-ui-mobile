import { execFileSync } from 'node:child_process'

export function bundleHabitRowMetadata() {
  const contents = `import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider } from 'next-intl';
    import en from '../../packages/shared/src/i18n/en.json';
    import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
    import { createMockHabit } from '../../packages/shared/src/__tests__/factories';
    import { makeMonthlyChildDaySchedule } from '../../packages/shared/src/test-support/habit-detail-fixtures';
    import { buildHabitDetailChildDateModel, normalizeHabitQueryData } from '../../packages/shared/src/utils';
    import { HabitRow } from './components/habits/habit-row';
    const root = document.getElementById('root');
    const locale = root.dataset.locale;
    const messages = locale === 'en' ? en : ptBR;
    function NotDueRows() {
      const date = '2026-11-01';
      const schedule = makeMonthlyChildDaySchedule();
      schedule.children.push({ ...schedule.children[0], id: 'child-3', isSkippedOnDate: false });
      const habitsById = normalizeHabitQueryData([schedule]).habitsById;
      const translations = key => key === 'habits.statusDot.skip' ? messages.habits.statusDot.skip : messages.calendar.dayCell.notScheduled;
      return schedule.children.map(child => {
        const normalized = habitsById.get(child.id);
        const model = buildHabitDetailChildDateModel(normalized, normalized, date, date, child);
        return <HabitRow key={child.id} habit={model.habit} depth={1} state={model.completed ? 'done' : 'empty'}
          meta={model.dateStatusKey ? [{ kind: 'date-status', label: translations(model.dateStatusKey) }] : []}
          canLog={model.canLog} completionReadOnly={model.completionReadOnly} completionStatusUnavailable={model.dateStatusKey !== undefined}
          actions={{ onLog: () => {}, onDetail: () => {}, onDelete: () => {} }} />;
      });
    }
    function Rows() {
      const [selecting, setSelecting] = useState(false);
      return <><button id="select-rows" onClick={() => setSelecting(value => !value)}>Select rows</button>
        {[0, 1].flatMap(depth => [false, true].map(parent => <HabitRow key={depth + ':' + parent}
          habit={createMockHabit({ id: depth + ':' + parent, title: 'Read pages', description: 'Read before breakfast.', checklistItems: Array.from({ length: 50 }, () => ({ text: 'Page', isChecked: true })) })}
          depth={depth} structuralColumn hasChildren={parent} childProgress={parent ? { done: 1, total: 3 } : undefined}
          meta={parent ? ['1/3', '08:00'] : ['08:00']} selectMode={selecting} selected={selecting}
          actions={{ onEdit: () => {}, onToggleSelection: () => {}, onToggleExpand: () => {} }} />))}</>;
    }
    createRoot(root).render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">{root.dataset.scenario === 'not-due' ? <NotDueRows /> : <Rows />}</NextIntlClientProvider>);`
  const options = { stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], alias: { '@sentry/nextjs': '@sentry/react' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } }
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build(${JSON.stringify(options)});
    process.stdout.write(result.outputFiles[0].text);
  `], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}
