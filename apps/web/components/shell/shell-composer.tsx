'use client'

import type { ChatComposerController } from '@/hooks/use-chat-composer'
import { Composer } from './composer'

export function ShellComposer({
  composer,
}: Readonly<{
  composer: ChatComposerController
}>) {
  return <Composer {...composer.composerProps} />
}
