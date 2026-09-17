import { useCallback, useState } from "react";
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

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchQuery("");
    setIsSearchOpen(false);
    setIsSearchFocused(false);
  }, [setSearchQuery]);

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
