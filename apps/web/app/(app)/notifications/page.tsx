import { getRouteMetadata } from '@/lib/route-metadata'
import { NotificationInbox } from '@/components/navigation/notification-inbox'

export function generateMetadata() {
  return getRouteMetadata('/notifications')
}

export default function NotificationsPage() {
  return <NotificationInbox />
}
