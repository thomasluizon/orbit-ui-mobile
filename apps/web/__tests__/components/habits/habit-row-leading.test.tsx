import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'

describe('HabitRowLeading', () => {
  it.each([
    { emoji: '🌱', emojiSize: 16, text: '🌱', fontSize: 16 },
    { emoji: '🌱', emojiSize: 20, text: '🌱', fontSize: 20 },
    { emoji: null, emojiSize: 16, text: 'R', fontSize: 12 },
    { emoji: null, emojiSize: 20, text: 'R', fontSize: 17 },
  ])('renders $text at $fontSize with emojiSize $emojiSize', ({ emoji, emojiSize, text, fontSize }) => {
    render(<HabitRowLeading title="Read" emoji={emoji} emojiSize={emojiSize} wellSize={32} wellRadius={8} />)

    expect(screen.getByText(text)).toHaveStyle({ fontSize: `${fontSize}px` })
  })
})
