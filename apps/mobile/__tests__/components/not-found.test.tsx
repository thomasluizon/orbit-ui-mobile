import { expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { StyleSheet } from 'react-native'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import NotFoundScreen from '@/app/+not-found'
vi.unmock('react-i18next')
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

async function mount(locale = 'en') {
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({ lng: locale, resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } } })
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<I18nextProvider i18n={i18n}><NotFoundScreen /></I18nextProvider>) })
  return tree
}

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }))
it.each([
  { locale: 'en', messages: en, action: 'Go to Today' },
  { locale: 'pt-BR', messages: ptBR, action: 'Ir para Hoje' },
])('returns a missing page to Today with the drawn action in $locale', async ({ locale, messages, action }) => {
  const tree = await mount(locale)
  const links = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'link')
  expect(links).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === messages.notFoundPage.title)).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === messages.notFoundPage.description)).toHaveLength(1)
  expect(links[0]!.findAll((node) => String(node.type) === 'Text' && node.props.children === action)).toHaveLength(1)
  const surface = tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]
  expect(StyleSheet.flatten(surface?.props.contentContainerStyle)).toMatchObject({ paddingTop: 64 })
  const press = links[0]?.props.onPress as () => void
  await act(() => { press() })
  expect(replace).toHaveBeenCalledWith('/')
  await act(() => { tree.update(<></>) })
})

it.each([412, 1024])('renders the drawn missing-page title size at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
  const tree = await mount()
  const title = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityRole === 'header')[0]!
  expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: width >= 1024 ? 28 : 22 })
  expect(StyleSheet.flatten(title.props.style)).toMatchObject({ alignSelf: 'stretch' })
  const surface = tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]!
  expect(StyleSheet.flatten(surface.props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 16 })
  await act(() => { tree.update(<></>) })
})
