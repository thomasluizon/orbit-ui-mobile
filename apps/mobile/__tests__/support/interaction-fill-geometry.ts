import { StyleSheet, type ViewStyle } from 'react-native'
import { measureProfileRow } from './profile-row-geometry'

type Host = Parameters<typeof measureProfileRow>[0]

export function measureInteractionFills(host: Host, width: number, pressed: boolean) {
  const hosts = new Map<string, { host: Host; ancestors: string[] }>()
  function mark(host: Host, ancestors: string[]): Host {
    const key = String(hosts.size)
    hosts.set(key, { host, ancestors })
    const declared = host.props.style
    const style = StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed }) : declared ?? {})
    return { ...host, props: { ...host.props, style, 'data-slot': key }, children: host.children?.map((child) => typeof child === 'string' ? child : mark(child, [...ancestors, key])) ?? null }
  }
  const marked = mark(host, [])
  const measured = measureProfileRow(marked, width, 1)
  return measured.parts.map((part) => ({ ...part, ...hosts.get(part.slot)! }))
}

export function paintedExtent(style: ViewStyle) {
  return style.outlineStyle === 'solid' ? Math.max(0, Number(style.outlineWidth ?? 0) + Number(style.outlineOffset ?? 0)) : 0
}

export function hasPaint(style: ViewStyle) {
  return Boolean(style.backgroundColor && style.backgroundColor !== 'transparent') || Number(style.outlineWidth ?? 0) > 0
}
