/**
 * Local ESLint rule: never drive continuous values through a scroll listener or
 * React state.
 *
 * The strongest consensus in the #539 harvest (5 independent skills). Three
 * distinct failures, one root cause — reading a continuously-changing value on the
 * main thread and routing it through React:
 *  - `window.addEventListener('scroll'|'wheel')` fires per frame on the main
 *    thread and, un-passive, blocks the scroll itself;
 *  - `scrollY` / `scrollTop` / `pageYOffset` read into a `useState` setter forces a
 *    full React render per frame, and reading layout mid-scroll thrashes;
 *  - a `requestAnimationFrame` LOOP whose body sets state re-renders forever at
 *    60fps.
 *
 * "Loop" is load-bearing in that third case: the rAF callback must re-schedule
 * itself. A ONE-SHOT `requestAnimationFrame(() => setIsVisible(true))` is the
 * idiomatic next-frame flip that lets an entrance transition apply from its
 * pre-mount state — it sets state exactly once and is correct. Flagging every
 * state-setting rAF would condemn that idiom, which both apps use.
 *
 * Use IntersectionObserver for "is it visible", a Scroll/View Timeline for
 * scroll-linked animation, or a motion value (`useScroll` / `useMotionValueEvent`)
 * which stays off the React render path.
 *
 * The listener check tolerates a genuinely cheap non-render listener only through
 * an eslint-disable with a reason — the rule cannot tell a cheap handler from an
 * expensive one, and the expensive one is the default.
 */

const SCROLL_EVENTS = new Set(['scroll', 'wheel', 'touchmove', 'mousewheel'])
const SCROLL_PROPERTIES = new Set(['scrollY', 'scrollX', 'scrollTop', 'scrollLeft', 'pageYOffset', 'pageXOffset'])
const SETTER_RE = /^set[A-Z]/

function isSetterCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    SETTER_RE.test(node.callee.name)
  )
}

function findSetterCall(node) {
  let found = null
  const walk = (current) => {
    if (found || current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (typeof current.type !== 'string') return
    if (isSetterCall(current)) {
      found = current
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue
      walk(current[key])
    }
  }
  walk(node)
  return found
}

/** True when the rAF callback re-schedules rAF — i.e. it is a loop, not a one-shot. */
function reschedulesItself(node) {
  let found = false
  const walk = (current) => {
    if (found || current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (typeof current.type !== 'string') return
    if (
      current.type === 'CallExpression' &&
      ((current.callee.type === 'Identifier' && current.callee.name === 'requestAnimationFrame') ||
        (current.callee.type === 'MemberExpression' &&
          current.callee.property.type === 'Identifier' &&
          current.callee.property.name === 'requestAnimationFrame'))
    ) {
      found = true
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue
      walk(current[key])
    }
  }
  walk(node)
  return found
}

function readsScrollProperty(node) {
  let found = null
  const walk = (current) => {
    if (found || current == null || typeof current !== 'object') return
    if (Array.isArray(current)) {
      for (const item of current) walk(item)
      return
    }
    if (typeof current.type !== 'string') return
    if (
      current.type === 'MemberExpression' &&
      current.property.type === 'Identifier' &&
      SCROLL_PROPERTIES.has(current.property.name)
    ) {
      found = current.property.name
      return
    }
    if (current.type === 'Identifier' && SCROLL_PROPERTIES.has(current.name) && current.parent?.type !== 'MemberExpression') {
      found = current.name
      return
    }
    for (const key of Object.keys(current)) {
      if (key === 'parent') continue
      walk(current[key])
    }
  }
  walk(node)
  return found
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban scroll listeners and rAF loops that drive React state — use IntersectionObserver, a Scroll Timeline, or a motion value.',
    },
    schema: [],
    messages: {
      noScrollListener:
        "A '{{event}}' listener fires every frame on the main thread. Use IntersectionObserver (for visibility), a Scroll/View Timeline, or a motion value (`useScroll`) — none of which re-render React per frame.",
      noScrollIntoState:
        '`{{property}}` is being read into React state, which forces a full render on every frame of the scroll. Use a motion value (`useScroll` + `useMotionValueEvent`) or a Scroll Timeline so the value never touches the render path.',
      noRafState:
        'This requestAnimationFrame loop sets React state, so it re-renders the tree at 60fps forever. Drive the value with a motion value or a CSS animation instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee

        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'addEventListener'
        ) {
          const first = node.arguments[0]
          if (first && first.type === 'Literal' && SCROLL_EVENTS.has(first.value)) {
            const handler = node.arguments[1]
            const property = handler ? readsScrollProperty(handler) : null
            const setter = handler ? findSetterCall(handler) : null
            if (property && setter) {
              context.report({ node, messageId: 'noScrollIntoState', data: { property } })
            } else {
              context.report({ node: first, messageId: 'noScrollListener', data: { event: first.value } })
            }
          }
          return
        }

        if (callee.type === 'Identifier' && callee.name === 'requestAnimationFrame') {
          const handler = node.arguments[0]
          if (handler && (handler.type === 'ArrowFunctionExpression' || handler.type === 'FunctionExpression')) {
            if (findSetterCall(handler.body) && reschedulesItself(handler.body)) {
              context.report({ node, messageId: 'noRafState' })
            }
          }
        }
      },
    }
  },
}
