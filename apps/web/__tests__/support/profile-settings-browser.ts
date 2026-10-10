import { execFileSync } from 'node:child_process'

export function bundleProfileSettings() {
  return bundleProfile('settings')
}

export function bundleProfilePreferences() {
  return bundleProfile('preferences')
}

function bundleProfile(kind: 'settings' | 'preferences') {
  const component = kind === 'settings' ? 'ProfileSettingsContent' : 'ProfilePreferencesContent'
  const contents = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { NextIntlClientProvider } from 'next-intl';
    import en from '../../packages/shared/src/i18n/en.json';
    import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
    import { ${component} } from './app/(app)/profile/_components/profile-${kind}-content';
    const root = document.getElementById('root');
    const locale = root.dataset.locale;
    const profile = JSON.parse(root.dataset.profile);
    globalThis.geometryProfile = profile;
    createRoot(root).render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><${component} profile={profile} isLoading={false} patchProfile={() => {}} /></NextIntlClientProvider>);`
  const boundaries = {
    '@/components/advanced/advanced-sections': 'export const WidgetInfoOverlay = () => null;',
    '@/hooks/use-profile': 'export const useProfile = () => ({ profile: globalThis.geometryProfile });',
    '@/stores/auth-store': 'export const useAuthStore = selector => selector({ logout: () => {} });',
    'next/navigation': 'export const useRouter = () => ({ push: () => {} });',
    '@/components/ui/sheet': 'export const Sheet = () => null;',
    '@/app/(app)/preferences/_components/use-preference-controls': `import { useLocale } from 'next-intl'; export const usePreferenceControls = () => ({ selectedLanguage: useLocale(), currentTheme: 'dark', activePicker: null, setActivePicker: () => {}, handleThemeModeChange: () => {}, showGeneralOnToday: false, toggleShowGeneral: () => {}, timeZoneMutation: { mutate: () => {} }, weekStartMutation: { mutate: () => {} }, clockFormatMutation: { mutate: () => {} } });`,
    '@/app/(app)/preferences/_components/preference-picker-sheet': 'export const PreferencePickerSheet = () => null;',
  }
  const options = { stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } }
  return execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const boundaries = ${JSON.stringify(boundaries)};
    const result = await build({ ...${JSON.stringify(options)}, plugins: [{ name: 'profile-boundaries', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in boundaries ? { path: args.path, namespace: 'boundary' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ contents: boundaries[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
    process.stdout.write(result.outputFiles[0].text);
  `], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}
