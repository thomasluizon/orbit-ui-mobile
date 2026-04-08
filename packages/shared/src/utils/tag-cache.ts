import type { HabitScheduleChild, HabitScheduleItem, HabitTag } from '../types/habit'

export interface TagSummary {
  id: string
  name: string
  color: string
}

export function appendTag<TTag extends TagSummary>(
  tags: TTag[] | undefined,
  tag: TTag,
): TTag[] | undefined {
  if (!tags) return tags
  return [...tags, tag]
}

export function updateTagInList<TTag extends TagSummary>(
  tags: TTag[] | undefined,
  tagId: string,
  patch: Partial<TTag>,
): TTag[] | undefined {
  if (!tags) return tags
  return tags.map((tag) => (tag.id === tagId ? { ...tag, ...patch } : tag))
}

export function removeTagFromList<TTag extends TagSummary>(
  tags: TTag[] | undefined,
  tagId: string,
): TTag[] | undefined {
  if (!tags) return tags
  return tags.filter((tag) => tag.id !== tagId)
}

function mapHabitChildren(
  children: HabitScheduleChild[],
  mapper: (tags: HabitTag[]) => HabitTag[],
): HabitScheduleChild[] {
  return children.map((child) => ({
    ...child,
    tags: mapper(child.tags),
    children: mapHabitChildren(child.children, mapper),
  }))
}

export function mapHabitTagReferences(
  items: HabitScheduleItem[] | undefined,
  mapper: (tags: HabitTag[]) => HabitTag[],
): HabitScheduleItem[] | undefined {
  if (!items) return items

  return items.map((item) => ({
    ...item,
    tags: mapper(item.tags),
    children: mapHabitChildren(item.children, mapper),
  }))
}

export function setHabitTags(
  items: HabitScheduleItem[] | undefined,
  habitId: string,
  tags: HabitTag[],
): HabitScheduleItem[] | undefined {
  if (!items) return items

  const patchChild = (child: HabitScheduleChild): HabitScheduleChild => {
    if (child.id === habitId) {
      return { ...child, tags }
    }

    return {
      ...child,
      children: child.children.map(patchChild),
    }
  }

  return items.map((item) => {
    if (item.id === habitId) {
      return { ...item, tags }
    }

    return {
      ...item,
      children: item.children.map(patchChild),
    }
  })
}

export function resolveHabitTags<TTag extends TagSummary>(
  availableTags: readonly TTag[],
  tagIds: readonly string[],
): HabitTag[] {
  const tagMap = new Map(availableTags.map((tag) => [tag.id, tag]))

  return tagIds
    .map((tagId) => tagMap.get(tagId))
    .filter((tag): tag is TTag => tag !== undefined)
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    }))
}
