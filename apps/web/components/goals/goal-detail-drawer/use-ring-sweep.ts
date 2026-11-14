'use client'

import { useEffect, useState } from 'react'
import { createUseRingSweep } from '@orbit/shared/hooks/ring-sweep-core'

/** One ring sweep from the value the person last saw. Pass null under reduced motion to draw the value at once. */
export const useRingSweep = createUseRingSweep({
  useState,
  useEffect,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
})
