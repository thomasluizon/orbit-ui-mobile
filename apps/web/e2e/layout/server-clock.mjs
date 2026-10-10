import { LAYOUT_FIXED_TIME } from './clock.mjs'

const NativeDate = globalThis.Date
const fixedTime = NativeDate.parse(LAYOUT_FIXED_TIME)
const fixedNow = () => fixedTime

globalThis.Date = new Proxy(NativeDate, {
  apply: () => new NativeDate(fixedTime).toString(),
  construct: (target, argumentsList, newTarget) =>
    Reflect.construct(target, argumentsList.length === 0 ? [fixedTime] : argumentsList, newTarget),
  get: (target, property, receiver) =>
    property === 'now' ? fixedNow : Reflect.get(target, property, receiver),
})
