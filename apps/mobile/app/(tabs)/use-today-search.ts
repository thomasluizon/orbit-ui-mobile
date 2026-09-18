import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { useUIStore } from "@/stores/ui-store";

export interface TodaySearch {
  searchQuery: string;
  isSearchOpen: boolean;
  isSearchFocused: boolean;
  setSearchQuery: (value: string) => void;
  setIsSearchFocused: (value: boolean) => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

export function useTodaySearch(): TodaySearch {
  const searchQuery = useUIStore((state) => state.searchQuery);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const wasSearchOpenRef = useRef(isSearchOpen);

  const closeSearch = useCallback(() => {
    setSearchQuery("");
    setIsSearchOpen(false);
    setIsSearchFocused(false);
  }, [setSearchQuery]);

  useEffect(() => {
    if (wasSearchOpenRef.current && !isSearchOpen) {
      Keyboard.dismiss();
    }
    wasSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch();
      return;
    }

    setIsSearchOpen(true);
  }, [closeSearch, isSearchOpen]);

  return {
    searchQuery,
    isSearchOpen,
    isSearchFocused,
    setSearchQuery,
    setIsSearchFocused,
    closeSearch,
    toggleSearch,
  };
}
