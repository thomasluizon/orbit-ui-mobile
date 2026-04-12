export interface SpeechRecognitionResult {
  transcript: string
}

export function resolveSpeechTranscript(
  results: readonly SpeechRecognitionResult[] | undefined,
): string {
  return (results ?? [])
    .map((result) => result.transcript.trim())
    .find(Boolean) ?? ''
}

export function buildSpeechRecognitionStartConfig(selectedLanguage: string): {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  androidIntentOptions: {
    EXTRA_MASK_OFFENSIVE_WORDS: boolean
    EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: number
  }
} {
  return {
    lang: selectedLanguage,
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    androidIntentOptions: {
      EXTRA_MASK_OFFENSIVE_WORDS: false,
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10000,
    },
  }
}
