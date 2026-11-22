
import { GuidedSearchFrame } from '@/components/search/guided-search-frame'
import { useSearchScreen } from '@/components/search/use-search-screen'

export default function SearchScreen() {
  const model = useSearchScreen()
  return <GuidedSearchFrame model={model} />
}
