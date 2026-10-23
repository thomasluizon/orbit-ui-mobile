import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { createUseMenuState, type MenuStateHook } from '@orbit/shared/hooks'

export const useMenuState: MenuStateHook = createUseMenuState({ useCallback, useEffect, useEffectEvent, useMemo, useState })
