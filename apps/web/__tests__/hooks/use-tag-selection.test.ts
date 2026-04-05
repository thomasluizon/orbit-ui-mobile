import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTagSelection } from '@/hooks/use-tag-selection'

describe('useTagSelection', () => {
  describe('initial state', () => {
    it('starts with empty selection by default', () => {
      const { result } = renderHook(() => useTagSelection())
      expect(result.current.selectedTagIds).toEqual([])
      expect(result.current.atTagLimit).toBe(false)
    })

    it('starts with provided initial tag IDs', () => {
      const { result } = renderHook(() => useTagSelection(['t-1', 't-2']))
      expect(result.current.selectedTagIds).toEqual(['t-1', 't-2'])
    })

    it('initializes new tag form state', () => {
      const { result } = renderHook(() => useTagSelection())
      expect(result.current.showNewTag).toBe(false)
      expect(result.current.newTagName).toBe('')
      expect(result.current.newTagColor).toBe('#7c3aed')
    })

    it('exposes tag color palette', () => {
      const { result } = renderHook(() => useTagSelection())
      expect(result.current.tagColors.length).toBeGreaterThan(0)
      expect(result.current.tagColors).toContain('#7c3aed')
    })
  })

  describe('toggleTag', () => {
    it('adds tag to selection', () => {
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.toggleTag('t-1')
      })

      expect(result.current.selectedTagIds).toEqual(['t-1'])
    })

    it('removes tag from selection', () => {
      const { result } = renderHook(() => useTagSelection(['t-1', 't-2']))

      act(() => {
        result.current.toggleTag('t-1')
      })

      expect(result.current.selectedTagIds).toEqual(['t-2'])
    })

    it('toggles the same tag on and off', () => {
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.toggleTag('t-1')
      })
      expect(result.current.selectedTagIds).toEqual(['t-1'])

      act(() => {
        result.current.toggleTag('t-1')
      })
      expect(result.current.selectedTagIds).toEqual([])
    })
  })

  describe('atTagLimit', () => {
    it('detects when at tag limit', () => {
      const { result } = renderHook(() => useTagSelection(['t-1', 't-2'], 2))
      expect(result.current.atTagLimit).toBe(true)
    })

    it('not at limit when below max', () => {
      const { result } = renderHook(() => useTagSelection(['t-1'], 5))
      expect(result.current.atTagLimit).toBe(false)
    })
  })

  describe('resetTags', () => {
    it('resets to empty selection', () => {
      const { result } = renderHook(() => useTagSelection(['t-1', 't-2']))

      act(() => {
        result.current.resetTags()
      })

      expect(result.current.selectedTagIds).toEqual([])
    })

    it('resets to specific tag IDs', () => {
      const { result } = renderHook(() => useTagSelection(['t-1']))

      act(() => {
        result.current.resetTags(['t-3', 't-4'])
      })

      expect(result.current.selectedTagIds).toEqual(['t-3', 't-4'])
    })

    it('also resets editing and new tag state', () => {
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.setShowNewTag(true)
        result.current.setNewTagName('Test')
        result.current.startEditTag({ id: 't-1', name: 'Old', color: '#000' })
      })

      act(() => {
        result.current.resetTags()
      })

      expect(result.current.showNewTag).toBe(false)
      expect(result.current.newTagName).toBe('')
      expect(result.current.editingTagId).toBeNull()
    })
  })

  describe('edit tag', () => {
    it('starts editing a tag', () => {
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.startEditTag({ id: 't-1', name: 'Exercise', color: '#dc2626' })
      })

      expect(result.current.editingTagId).toBe('t-1')
      expect(result.current.editTagName).toBe('Exercise')
      expect(result.current.editTagColor).toBe('#dc2626')
    })

    it('saves edited tag', async () => {
      const mockUpdateTag = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.startEditTag({ id: 't-1', name: 'Old Name', color: '#000' })
      })

      act(() => {
        result.current.setEditTagName('New Name')
        result.current.setEditTagColor('#dc2626')
      })

      await act(async () => {
        await result.current.saveEditTag(mockUpdateTag)
      })

      expect(mockUpdateTag).toHaveBeenCalledWith('t-1', 'New Name', '#dc2626')
      expect(result.current.editingTagId).toBeNull()
    })

    it('does not save when editing tag name is empty', async () => {
      const mockUpdateTag = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.startEditTag({ id: 't-1', name: '', color: '#000' })
      })

      act(() => {
        result.current.setEditTagName('   ')
      })

      await act(async () => {
        await result.current.saveEditTag(mockUpdateTag)
      })

      expect(mockUpdateTag).not.toHaveBeenCalled()
    })

    it('cancels editing', () => {
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.startEditTag({ id: 't-1', name: 'Test', color: '#000' })
      })

      act(() => {
        result.current.cancelEditTag()
      })

      expect(result.current.editingTagId).toBeNull()
    })
  })

  describe('deleteTag', () => {
    it('removes tag from selection and calls delete function', async () => {
      const mockDeleteTag = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useTagSelection(['t-1', 't-2']))

      await act(async () => {
        await result.current.deleteTag('t-1', mockDeleteTag)
      })

      expect(result.current.selectedTagIds).toEqual(['t-2'])
      expect(mockDeleteTag).toHaveBeenCalledWith('t-1')
    })

    it('cancels editing if deleting the tag being edited', async () => {
      const mockDeleteTag = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useTagSelection(['t-1']))

      act(() => {
        result.current.startEditTag({ id: 't-1', name: 'Test', color: '#000' })
      })

      await act(async () => {
        await result.current.deleteTag('t-1', mockDeleteTag)
      })

      expect(result.current.editingTagId).toBeNull()
    })
  })

  describe('createAndSelectTag', () => {
    it('creates tag and adds to selection', async () => {
      const mockCreateTag = vi.fn().mockResolvedValue('new-tag-id')
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.setNewTagName('New Tag')
        result.current.setNewTagColor('#2563eb')
        result.current.setShowNewTag(true)
      })

      await act(async () => {
        await result.current.createAndSelectTag(mockCreateTag)
      })

      expect(mockCreateTag).toHaveBeenCalledWith('New Tag', '#2563eb')
      expect(result.current.selectedTagIds).toContain('new-tag-id')
      expect(result.current.newTagName).toBe('')
      expect(result.current.showNewTag).toBe(false)
    })

    it('does not add tag when create returns null', async () => {
      const mockCreateTag = vi.fn().mockResolvedValue(null)
      const { result } = renderHook(() => useTagSelection())

      act(() => {
        result.current.setNewTagName('Failed Tag')
      })

      await act(async () => {
        await result.current.createAndSelectTag(mockCreateTag)
      })

      expect(result.current.selectedTagIds).toEqual([])
    })

    it('does not call create when name is empty', async () => {
      const mockCreateTag = vi.fn().mockResolvedValue('id')
      const { result } = renderHook(() => useTagSelection())

      // newTagName is empty by default
      await act(async () => {
        await result.current.createAndSelectTag(mockCreateTag)
      })

      expect(mockCreateTag).not.toHaveBeenCalled()
    })
  })
})
