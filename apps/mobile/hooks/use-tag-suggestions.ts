import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SuggestedTag } from "@orbit/shared/types/habit";
import { useSuggestTags } from "@/hooks/use-tags";

interface TagSuggestionsState {
  suggestions: SuggestedTag[];
  noResults: boolean;
  isPending: boolean;
  canSuggest: boolean;
  suggest: () => Promise<void>;
  dismiss: (suggestion: SuggestedTag) => void;
}

/** Owns the AI tag-suggestion request and its result list for the habit form. */
export function useTagSuggestions(
  title: string,
  description: string,
  atTagLimit: boolean,
): TagSuggestionsState {
  const { i18n } = useTranslation();
  const suggestMutation = useSuggestTags();
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([]);
  const [noResults, setNoResults] = useState(false);

  const trimmedTitle = title.trim();
  const canSuggest =
    trimmedTitle.length > 0 && !atTagLimit && !suggestMutation.isPending;

  async function suggest(): Promise<void> {
    if (!canSuggest) return;
    setNoResults(false);
    const response = await suggestMutation.mutateAsync({
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      language: i18n.language,
    });
    setSuggestions(response.tags);
    setNoResults(response.tags.length === 0);
  }

  function dismiss(suggestion: SuggestedTag): void {
    setSuggestions((previous) =>
      previous.filter((candidate) => candidate.name !== suggestion.name),
    );
  }

  return {
    suggestions,
    noResults,
    isPending: suggestMutation.isPending,
    canSuggest,
    suggest,
    dismiss,
  };
}
