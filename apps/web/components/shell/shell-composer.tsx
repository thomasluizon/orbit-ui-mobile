'use client'

import { useChatComposer } from '@/hooks/use-chat-composer'
import { Composer } from './composer'

export function ShellComposer({
  onOpenConversation,
}: Readonly<{
  onOpenConversation: () => void
}>) {
  const { composerProps, fileInputRef, handleFileSelect } = useChatComposer({
    onOpenConversation,
  })

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
