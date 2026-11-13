import { Redirect } from 'expo-router'

/** The old slug of the AI settings page. An in-app link from stored data still reaches the page. */
export default function LegacyAiSettingsRedirect() {
  return <Redirect href="/profile/ai" />
}
