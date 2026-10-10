import { accountEventTicketSchema } from '@orbit/shared/types/account-event'

export const accountEventTicketFixture = accountEventTicketSchema.parse({
  ticket: 'hermetic-account-event-ticket',
  expiresAtUtc: '2099-01-01T00:00:00Z',
})
