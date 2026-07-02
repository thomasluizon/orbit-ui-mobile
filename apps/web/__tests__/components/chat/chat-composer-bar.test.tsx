import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

import { ChatComposerBar } from '@/app/(chat)/chat/chat-composer-bar'

function baseProps() {
  return {
    textareaRef: createRef<HTMLTextAreaElement>(),
    fileInputRef: createRef<HTMLInputElement>(),
    input: '',
    setInput: vi.fn(),
    sendError: null,
    imagePreview: null,
    isOnline: true,
    isRecording: false,
    isTranscribing: false,
    speechSupported: true,
    toggleRecording: vi.fn(),
    recordingTime: '0:05',
    starterChips: [] as string[],
    isTyping: false,
    hasProAccess: false,
    aiMessagesUsed: 3,
    aiMessagesLimit: 20,
    atMessageLimit: false,
    canSend: true,
    hasMessages: false,
    limitLocked: false,
    openFilePicker: vi.fn(),
    handleFileSelect: vi.fn(),
    handlePaste: vi.fn(),
    handleKeyDown: vi.fn(),
    removeImage: vi.fn(),
    textFileInputRef: createRef<HTMLInputElement>(),
    selectedTextFileName: null as string | null,
    openTextFilePicker: vi.fn(),
    handleTextFileSelect: vi.fn(),
    removeTextFile: vi.fn(),
    sendMessage: vi.fn(),
    retryLastSend: vi.fn(),
    canRetryLastSend: false,
    onUpgrade: vi.fn(),
  }
}

describe('ChatComposerBar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the textarea with the placeholder and sends on send-button click', () => {
    const props = baseProps()
    render(<ChatComposerBar {...props} />)
    expect(screen.getByLabelText('chat.placeholder')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('chat.send'))
    expect(props.sendMessage).toHaveBeenCalled()
  })

  it('typing in the textarea calls setInput', () => {
    const props = baseProps()
    render(<ChatComposerBar {...props} />)
    fireEvent.change(screen.getByLabelText('chat.placeholder'), {
      target: { value: 'hello' },
    })
    expect(props.setInput).toHaveBeenCalledWith('hello')
  })

  it('disables the send button when canSend is false', () => {
    const props = { ...baseProps(), canSend: false }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByLabelText('chat.send')).toBeDisabled()
  })

  it('shows the message usage counter for non-pro users under the limit', () => {
    render(<ChatComposerBar {...baseProps()} />)
    expect(screen.getByText('3/20 chat.messagesUsed')).toBeInTheDocument()
  })

  it('hides the usage counter for pro users', () => {
    render(<ChatComposerBar {...{ ...baseProps(), hasProAccess: true }} />)
    expect(screen.queryByText('3/20 chat.messagesUsed')).not.toBeInTheDocument()
  })

  it('renders a send-error alert and retry button that fires retryLastSend', () => {
    const props = {
      ...baseProps(),
      sendError: 'Something failed',
      canRetryLastSend: true,
    }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed')
    fireEvent.click(screen.getByText('common.retry'))
    expect(props.retryLastSend).toHaveBeenCalled()
  })

  it('omits the retry button when retry is unavailable', () => {
    const props = {
      ...baseProps(),
      sendError: 'Something failed',
      canRetryLastSend: false,
    }
    render(<ChatComposerBar {...props} />)
    expect(screen.queryByText('common.retry')).not.toBeInTheDocument()
  })

  it('renders the image preview and removes it on click', () => {
    const props = { ...baseProps(), imagePreview: 'blob:preview' }
    render(<ChatComposerBar {...props} />)
    fireEvent.click(screen.getByLabelText('chat.removeImage'))
    expect(props.removeImage).toHaveBeenCalled()
  })

  it('renders starter chips when there are messages and sends the chip on click', () => {
    const props = {
      ...baseProps(),
      hasMessages: true,
      starterChips: ['First chip', 'Second chip'],
    }
    render(<ChatComposerBar {...props} />)
    fireEvent.click(screen.getByText('First chip'))
    expect(props.sendMessage).toHaveBeenCalledWith('First chip')
  })

  it('renders the recording bar with stop control while recording', () => {
    const props = { ...baseProps(), isRecording: true }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByText('0:05')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('chat.stopRecording'))
    expect(props.toggleRecording).toHaveBeenCalled()
  })

  it('shows the transcribing state and disables the stop button while transcribing', () => {
    const props = { ...baseProps(), isRecording: false, isTranscribing: true }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByText('chat.transcribing')).toBeInTheDocument()
    expect(screen.queryByText('0:05')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('chat.placeholder')).not.toBeInTheDocument()
    expect(screen.getByLabelText('chat.stopRecording')).toBeDisabled()
  })

  it('opens the file picker when the attach button is clicked', () => {
    const props = baseProps()
    render(<ChatComposerBar {...props} />)
    fireEvent.click(screen.getByLabelText('chat.attachImage'))
    expect(props.openFilePicker).toHaveBeenCalled()
  })

  it('opens the text-file picker when the attach-file button is clicked', () => {
    const props = baseProps()
    render(<ChatComposerBar {...props} />)
    fireEvent.click(screen.getByLabelText('chat.attachFile'))
    expect(props.openTextFilePicker).toHaveBeenCalled()
  })

  it('renders the attached text-file chip and removes it on click', () => {
    const props = { ...baseProps(), selectedTextFileName: 'habits.csv' }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByText('habits.csv')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('chat.removeFile'))
    expect(props.removeTextFile).toHaveBeenCalled()
  })

  it('toggles recording from the mic button', () => {
    const props = baseProps()
    render(<ChatComposerBar {...props} />)
    fireEvent.click(screen.getByLabelText('chat.toggleMic'))
    expect(props.toggleRecording).toHaveBeenCalled()
  })

  it('hides the mic when speech is unsupported', () => {
    const props = { ...baseProps(), speechSupported: false }
    render(<ChatComposerBar {...props} />)
    expect(screen.queryByLabelText('chat.toggleMic')).not.toBeInTheDocument()
  })

  it('locks the input and shows the upgrade gate when the limit is reached', () => {
    const props = { ...baseProps(), limitLocked: true }
    render(<ChatComposerBar {...props} />)
    expect(screen.getByLabelText('chat.placeholder')).toBeDisabled()
    fireEvent.click(screen.getByText('upgrade.subscribe'))
    expect(props.onUpgrade).toHaveBeenCalled()
  })

  it('shows the offline notice and disables the composer while offline', () => {
    render(<ChatComposerBar {...{ ...baseProps(), isOnline: false }} />)
    expect(
      screen.getByRole('alert', { name: 'chat.offline.title. chat.offline.description' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('chat.placeholder')).toBeDisabled()
    expect(screen.getByLabelText('chat.attachFile')).toBeDisabled()
    expect(screen.getByLabelText('chat.attachImage')).toBeDisabled()
    expect(screen.getByLabelText('chat.toggleMic')).toBeDisabled()
  })

  it('hides the offline notice when online', () => {
    render(<ChatComposerBar {...baseProps()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('chat.attachFile')).toBeEnabled()
  })
})
