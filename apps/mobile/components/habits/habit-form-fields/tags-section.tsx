import { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getFriendlyErrorMessage } from "@orbit/shared/utils";
import { validateTagForm } from "@orbit/shared/validation";
import type { TagSelectionState } from "@/hooks/use-tag-selection";
import { useAppToast } from "@/hooks/use-app-toast";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from "@/hooks/use-tags";
import { type AppTokens } from "./styles";
import { TagColorPicker } from "./tag-color-picker";
import { TagEditorRow } from "./tag-editor-row";
import { HabitTagChip } from "./habit-tag-chip";
import type { HabitFormStyles } from "./types";

interface TagsSectionProps {
  tags: TagSelectionState;
  styles: HabitFormStyles;
  tokens: AppTokens;
}

export function TagsSection({
  tags,
  styles,
  tokens,
}: Readonly<TagsSectionProps>) {
  const { t } = useTranslation();
  const translate = useCallback(
    (key: string, values?: Record<string, unknown>) => t(key, values),
    [t],
  );
  const { showError } = useAppToast();
  const { tags: availableTags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const isTagMutationPending =
    createTag.isPending || updateTag.isPending || deleteTag.isPending;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{t("habits.form.tags")}</Text>
      <View style={styles.tagsRow}>
        {availableTags.map((tag) => {
          const isSelected = tags.selectedTagIds.includes(tag.id);
          const isDisabled = !isSelected && tags.atTagLimit;
          return (
            <HabitTagChip
              key={tag.id}
              tag={tag}
              selected={isSelected}
              atLimit={isDisabled}
              disabled={isTagMutationPending}
              styles={styles}
              tokens={tokens}
              onToggle={() => tags.toggleTag(tag.id)}
              onEdit={() => tags.startEditTag(tag)}
              onDelete={() =>
                tags.deleteTag(tag.id, async (id) => {
                  try {
                    await deleteTag.mutateAsync(id);
                  } catch (error: unknown) {
                    showError(
                      getFriendlyErrorMessage(
                        error,
                        translate,
                        "toast.errors.validation",
                        "tag",
                      ),
                    );
                    throw error;
                  }
                })
              }
            />
          );
        })}
        {!tags.showNewTag && !tags.atTagLimit && (
          <TouchableOpacity
            style={styles.newTagButton}
            disabled={isTagMutationPending}
            onPress={() => tags.setShowNewTag(true)}
            activeOpacity={0.7}
          >
            <Plus size={14} color={tokens.fg2} strokeWidth={2} />
            <Text style={styles.newTagButtonText}>
              {t("habits.form.newTag")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {tags.editingTagId && (
        <View style={styles.tagEditSection}>
          <TagColorPicker
            colors={tags.tagColors}
            activeColor={tags.editTagColor}
            onSelect={tags.setEditTagColor}
            ariaLabel={(color) => t("habits.form.selectColor", { color })}
            styles={styles}
          />
          <TagEditorRow
            value={tags.editTagName}
            inputAriaLabel={t("habits.form.tagName")}
            actionLabel={t("common.save")}
            cancelAriaLabel={t("common.cancel")}
            disabled={isTagMutationPending}
            onChange={tags.setEditTagName}
            onCommit={() => {
              const validationErrorKey = validateTagForm(
                tags.editTagName,
                tags.editTagColor,
              );
              if (validationErrorKey) {
                showError(translate(validationErrorKey));
                return;
              }

              void tags.saveEditTag(async (id, name, color) => {
                try {
                  await updateTag.mutateAsync({ tagId: id, name, color });
                } catch (error: unknown) {
                  showError(
                    getFriendlyErrorMessage(
                      error,
                      translate,
                      "toast.errors.validation",
                      "tag",
                    ),
                  );
                  throw error;
                }
              });
            }}
            onCancel={tags.cancelEditTag}
            styles={styles}
            tokens={tokens}
          />
        </View>
      )}

      {tags.showNewTag && (
        <View style={styles.tagEditSection}>
          <TagColorPicker
            colors={tags.tagColors}
            activeColor={tags.newTagColor}
            onSelect={tags.setNewTagColor}
            ariaLabel={(color) => t("habits.form.selectColor", { color })}
            styles={styles}
          />
          <TagEditorRow
            value={tags.newTagName}
            placeholder={t("habits.form.tagName")}
            inputAriaLabel={t("habits.form.tagName")}
            actionLabel={t("common.add")}
            cancelAriaLabel={t("common.cancel")}
            disabled={isTagMutationPending}
            onChange={tags.setNewTagName}
            onCommit={() => {
              const validationErrorKey = validateTagForm(
                tags.newTagName,
                tags.newTagColor,
              );
              if (validationErrorKey) {
                showError(translate(validationErrorKey));
                return;
              }

              void tags.createAndSelectTag(async (name, color) => {
                try {
                  const result = await createTag.mutateAsync({ name, color });
                  return result.id;
                } catch (error: unknown) {
                  showError(
                    getFriendlyErrorMessage(
                      error,
                      translate,
                      "toast.errors.validation",
                      "tag",
                    ),
                  );
                  throw error;
                }
              });
            }}
            onCancel={() => tags.setShowNewTag(false)}
            styles={styles}
            tokens={tokens}
          />
        </View>
      )}
    </View>
  );
}
