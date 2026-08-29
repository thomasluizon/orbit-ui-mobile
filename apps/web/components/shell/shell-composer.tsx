'use client'

import type { ChatComposerController } from '@/hooks/use-chat-composer'
import { Composer } from './composer'

export function ShellComposer({
  composer,
}: Readonly<{
  composer: ChatComposerController
}>) {
  const { composerProps, fileInputRef, handleFileSelect } = composer

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
      <Composer {...composerProps} />
    </>
  )
}
