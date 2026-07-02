import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { DismissibleCard } from "@/components/today/dismissible-card";

const { pendingAnimationCompletions } = vi.hoisted(() => ({
  pendingAnimationCompletions: [] as (() => void)[],
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Animated: {
      ...(actual.Animated as Record<string, unknown>),
      timing: (
        value: { setValue: (nextValue: number) => void },
        config: { toValue: number },
      ) => {
        let cancelled = false;
        return {
          start: (callback?: (result: { finished: boolean }) => void) => {
            pendingAnimationCompletions.push(() => {
              if (cancelled) {
                callback?.({ finished: false });
                return;
              }
              value.setValue(config.toValue);
              callback?.({ finished: true });
            });
          },
          stop: () => {
            cancelled = true;
          },
        };
      },
    },
  };
});

const TestRenderer: typeof import("react-test-renderer") = require("react-test-renderer");

type RenderedTree = {
  root: { findAllByType: (type: string) => unknown[] };
  update: (element: React.ReactElement) => void;
};

function renderCard(visible: boolean): RenderedTree {
  let tree: unknown = null;
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <DismissibleCard visible={visible}>
        <Text>card-content</Text>
      </DismissibleCard>,
    );
  });
  if (!tree) {
    throw new Error("Expected the card to render");
  }
  return tree as RenderedTree;
}

function updateCard(tree: RenderedTree, visible: boolean) {
  TestRenderer.act(() => {
    tree.update(
      <DismissibleCard visible={visible}>
        <Text>card-content</Text>
      </DismissibleCard>,
    );
  });
}

function flushAnimations() {
  TestRenderer.act(() => {
    for (const complete of pendingAnimationCompletions.splice(0)) {
      complete();
    }
  });
}

describe("DismissibleCard", () => {
  beforeEach(() => {
    pendingAnimationCompletions.length = 0;
  });

  it("renders its children while visible", () => {
    const tree = renderCard(true);

    expect(tree.root.findAllByType("Text")).toHaveLength(1);
  });

  it("renders nothing when it was never visible", () => {
    const tree = renderCard(false);

    expect(tree.root.findAllByType("Text")).toHaveLength(0);
  });

  it("keeps children mounted through the exit animation, then unmounts them", () => {
    const tree = renderCard(true);

    updateCard(tree, false);
    expect(tree.root.findAllByType("Text")).toHaveLength(1);

    flushAnimations();
    expect(tree.root.findAllByType("Text")).toHaveLength(0);
  });

  it("stays mounted when it becomes visible again before the exit finishes", () => {
    const tree = renderCard(true);

    updateCard(tree, false);
    updateCard(tree, true);
    flushAnimations();

    expect(tree.root.findAllByType("Text")).toHaveLength(1);
  });
});
