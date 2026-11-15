import { Text } from 'react-native'
import { expect, it, vi } from 'vitest'
import { GuidedSignInProvider, useGuidedSignIn } from '@/components/auth/guided-sign-in'

const { act, create } = require('react-test-renderer')
const flag = vi.hoisted((): { keys: string[]; guided: boolean } => ({ keys: [], guided: false }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: (key: string) => { flag.keys.push(key); return flag.guided } }))

function Probe() {
  return <Text>{useGuidedSignIn() ? 'on' : 'off'}</Text>
}
function shown(element: React.ReactElement): string {
  let tree: { root: { findByType: (type: string) => { props: { children: string } } }; unmount: () => void }
  act(() => { tree = create(element) })
  const value = tree!.root.findByType('Text').props.children
  act(() => tree.unmount())
  return value
}

it.each([[true, 'on'], [false, 'off']] as const)('gives the sign-in surfaces the orbit_guided_flows read %s', (guided, value) => {
  flag.keys.length = 0
  flag.guided = guided
  expect(shown(<GuidedSignInProvider><Probe /></GuidedSignInProvider>)).toBe(value)
  expect(flag.keys).toEqual(['orbit_guided_flows'])
})

it('reads off outside the provider', () => {
  expect(shown(<Probe />)).toBe('off')
})
