import { questionBlockSchema } from '../types/question-block'

export const questionBlockFixture = questionBlockSchema.parse({
  blockId: '11111111-1111-4111-8111-111111111111',
  expiresAtUtc: '2099-01-01T00:00:00Z',
  title: 'Your routine',
  intro: 'Choose what works for you.',
  progress: { current: 2, total: 8 },
  questions: [
    { id: 'time', type: 'singleChoice', prompt: 'When?', allowFreeText: true, options: [
      { id: 'morning', label: 'Morning', recommended: true }, { id: 'evening', label: 'Evening' },
    ] },
    { id: 'activities', type: 'multipleChoice', prompt: 'Which activities?', allowFreeText: true, options: [
      { id: 'walk', label: 'Walking' }, { id: 'read', label: 'Reading' },
    ] },
    { id: 'energy', type: 'scale', prompt: 'How much energy?', allowFreeText: false, lowLabel: 'Low', highLabel: 'High' },
    { id: 'duration', type: 'slider', prompt: 'How long?', allowFreeText: false, min: -0.3, max: 0.3, step: 0.1, unit: 'hours' },
    { id: 'reminder', type: 'yesNo', prompt: 'Add a reminder?', allowFreeText: true },
  ],
})

export const questionAnswersFixture = [
  { questionId: 'time', selectedIds: ['morning'] },
  { questionId: 'activities', selectedIds: ['walk', 'read'], freeText: 'Swimming' },
  { questionId: 'energy', number: 3 },
  { questionId: 'duration', number: 0 },
  { questionId: 'reminder', boolean: false },
]
