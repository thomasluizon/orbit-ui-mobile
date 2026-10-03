import type en from '../i18n/en.json'

export function emptyStateTitles(words: typeof en) {
  return [
    { key: 'progressScreen.goals.empty', title: words.progressScreen.goals.empty, inset: 16 },
    { key: 'progressScreen.window.empty', title: words.progressScreen.window.empty, inset: 16 },
    { key: 'progressScreen.achievements.empty', title: words.progressScreen.achievements.empty, inset: 16 },
    { key: 'chat.empty.title', title: words.chat.empty.title, inset: 16 },
    { key: 'calendar.noEvents', title: words.calendar.noEvents, inset: 24 },
    { key: 'calendar.autoSync.reviewModeEmpty', title: words.calendar.autoSync.reviewModeEmpty, inset: 24 },
  ]
}
