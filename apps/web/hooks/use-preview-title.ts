import { useRef, useState } from 'react'
import { createUsePreviewTitle } from '@orbit/shared/hooks'

export const usePreviewTitle = createUsePreviewTitle({ useState, useRef })
