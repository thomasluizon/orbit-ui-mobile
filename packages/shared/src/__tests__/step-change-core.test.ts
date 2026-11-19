import { createElement, useEffect, useRef } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseStepChange } from '../hooks/step-change-core'

const useStepChange = createUseStepChange({ useEffect, useRef })

function mountStep(stepKey: string, onChange: () => void | (() => void)) {
  function StepProbe(props: { stepKey: string; onChange: () => void | (() => void) }) {
    useStepChange(props.stepKey, props.onChange)
    return null
  }
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(createElement(StepProbe, { stepKey, onChange })) })
  return {
    update: (nextKey: string, nextChange = onChange) => { void act(() => tree.update(createElement(StepProbe, { stepKey: nextKey, onChange: nextChange }))) },
    unmount: () => { void act(() => tree.unmount()) },
  }
}

describe('shared step change', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
  afterEach(() => vi.unstubAllGlobals())

  it('runs nothing on the first mount and runs on each later change, a return to the first key included', () => {
    const onChange = vi.fn()
    const step = mountStep('what', onChange)
    expect(onChange).not.toHaveBeenCalled()
    step.update('when')
    expect(onChange).toHaveBeenCalledTimes(1)
    step.update('what')
    expect(onChange).toHaveBeenCalledTimes(2)
    step.update('summary')
    step.update('what')
    expect(onChange).toHaveBeenCalledTimes(4)
    step.unmount()
  })

  it('runs nothing when the key stays and only the callback changes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const step = mountStep('what', first)
    step.update('what', second)
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    step.update('when', second)
    expect(second).toHaveBeenCalledTimes(1)
    step.unmount()
  })

  it('runs the cleanup of a change before the next change and on unmount', () => {
    const cleanup = vi.fn()
    const step = mountStep('what', () => cleanup)
    step.update('when')
    expect(cleanup).not.toHaveBeenCalled()
    step.update('what')
    expect(cleanup).toHaveBeenCalledTimes(1)
    step.unmount()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})
