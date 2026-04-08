export interface PaginatedItemsResponse<TItem> {
  items: TItem[]
  totalPages: number
}

export async function fetchAllPaginatedItems<
  TItem,
  TPage extends PaginatedItemsResponse<TItem>,
>(
  fetchPage: (page: number) => Promise<TPage>,
): Promise<TItem[]> {
  const firstPage = await fetchPage(1)
  const allItems = [...firstPage.items]

  if (firstPage.totalPages <= 1) {
    return allItems
  }

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      fetchPage(index + 2),
    ),
  )

  for (const page of remainingPages) {
    allItems.push(...page.items)
  }

  return allItems
}
