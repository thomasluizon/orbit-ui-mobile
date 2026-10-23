import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { PwaLaunchHandler } from '@/components/pwa-launch-handler'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

type LaunchParameters = { targetURL: string; files: readonly FileSystemHandle[] }
let consumer: (parameters: LaunchParameters) => void

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('launchQueue', {
    setConsumer: (callback: typeof consumer) => { consumer = callback },
  })
})
afterEach(() => vi.unstubAllGlobals())

it.each(['/login', '/', '/calendar?date=2026-10-01#today', '/profile/subscription'])(
  'routes a same-origin launch to %s', (path) => {
    render(<PwaLaunchHandler />)
    consumer({ targetURL: `${window.location.origin}${path}`, files: [] })
    expect(router.push).toHaveBeenCalledExactlyOnceWith(path)
  },
)

it.each([
  '', 'malformed', '/calendar', '//other.example/calendar',
  'https://other.example/calendar', 'javascript:alert(1)',
  `${window.location.origin}//other.example/calendar`,
  window.location.origin.replace('://', '://account:password@'),
])('ignores an unsafe or invalid launch target %s', (targetURL) => {
  render(<PwaLaunchHandler />)
  consumer({ targetURL, files: [] })
  expect(router.push).not.toHaveBeenCalled()
})

it('keeps one active consumer through strict effects and rerenders and stops routing after unmount', () => {
  const view = render(<StrictMode><PwaLaunchHandler /></StrictMode>)
  const launch = { targetURL: `${window.location.origin}/calendar`, files: [] }
  consumer(launch)
  view.rerender(<StrictMode><PwaLaunchHandler /></StrictMode>)
  expect(router.push).toHaveBeenCalledTimes(1)
  consumer(launch)
  expect(router.push).toHaveBeenCalledTimes(2)
  view.unmount()
  consumer(launch)
  expect(router.push).toHaveBeenCalledTimes(2)
})

it('renders in browsers without a launch queue', () => {
  vi.stubGlobal('launchQueue', undefined)
  const view = render(<PwaLaunchHandler />)
  expect(view.container).toBeEmptyDOMElement()
  expect(router.push).not.toHaveBeenCalled()
})
