import { fireEvent, screen } from '@testing-library/react'

export async function chooseApiKeyCreation(label: string, createLabel = 'profile.apiKeys.create') {
  fireEvent.click(screen.getByRole('button', { name: createLabel }))
  fireEvent.click(await screen.findByRole('menuitem', { name: label }))
}
