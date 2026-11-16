import { useRef, useState } from 'react'
import { createUseSubmitHold } from '@orbit/shared/hooks'

export const useSubmitHold = createUseSubmitHold({ useState, useRef })
