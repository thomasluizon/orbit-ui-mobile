import React from 'react'

type HostProps = Readonly<{
  children?: React.ReactNode
  [key: string]: unknown
}>

function createHostComponent(name: string) {
  return function HostComponent({ children, ...props }: HostProps) {
    return React.createElement(name, props, children)
  }
}

const View = createHostComponent('View')
const Text = createHostComponent('Text')
const TouchableOpacity = createHostComponent('TouchableOpacity')
const Pressable = createHostComponent('Pressable')
const ScrollView = createHostComponent('ScrollView')
const FlatList = createHostComponent('FlatList')
const TextInput = createHostComponent('TextInput')
const Image = createHostComponent('Image')
const Modal = createHostComponent('Modal')
const AnimatedView = createHostComponent('AnimatedView')

export const Animated = {
  Value: class AnimatedValue {
    constructor(public readonly value: number) {}
  },
  View: AnimatedView,
  timing: () => ({ start: () => {}, stop: () => {} }),
  sequence: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  parallel: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  loop: (animation: { start?: () => void; stop?: () => void }) => animation,
  event: () => () => {},
}

export const Platform = {
  OS: 'android',
  select: <T,>(values: { android?: T; default?: T }) => values.android ?? values.default,
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: (style: unknown) => style,
}

export { FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View }

export default {
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
}
