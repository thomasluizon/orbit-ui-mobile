'use client'

import { useQuery } from '@tanstack/react-query'
import { tagKeys } from '@orbit/shared/query'
import { getTags } from '@/app/actions/tags'

export interface Tag {
  id: string
  name: string
  color: string
}

export function useTags() {
  const query = useQuery({
    queryKey: tagKeys.lists(),
    queryFn: () => getTags(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    tags: (query.data ?? []) as Tag[],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  }
}
