export const shellScrollViewports = [
  { width: 390, height: 915 },
  { width: 840, height: 915 },
  { width: 1024, height: 915 },
  { width: 1280, height: 915 },
  { width: 1440, height: 915 },
  { width: 800, height: 600 },
  { width: 900, height: 600 },
  { width: 1100, height: 706 },
  { width: 1352, height: 706 },
]

export async function measureShellScrollEnd(element: HTMLElement) {
  const frame = () => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
  const initialHeight = element.scrollHeight
  for (let step = 0; step < Math.ceil(initialHeight / 300) + 5; step++) {
    element.scrollTop += 300
    await frame()
  }
  element.scrollTop = element.scrollHeight
  await frame()
  const last = [...element.querySelectorAll('[data-testid="habit-row"]')].at(-1)!.getBoundingClientRect()
  return {
    initialHeight, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
    scrollTop: element.scrollTop, lastTop: last.top, lastBottom: last.bottom,
    scrollerTop: element.getBoundingClientRect().top, scrollerBottom: element.getBoundingClientRect().bottom,
    padding: Number.parseFloat(getComputedStyle(element).paddingBottom),
  }
}
