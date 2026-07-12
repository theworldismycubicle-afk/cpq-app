import { create } from 'zustand';

interface UiState {
  collapsedSteps: Record<string, boolean>;
  collapsedSubs: Record<string, boolean>;
  toggleStep: (id: string) => void;
  toggleSub: (id: string) => void;
  collapseAll: (stepIds: string[], subIds: string[]) => void;
  expandAll: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  collapsedSteps: {},
  collapsedSubs: {},

  toggleStep: (id) =>
    set((s) => ({ collapsedSteps: { ...s.collapsedSteps, [id]: !s.collapsedSteps[id] } })),

  toggleSub: (id) =>
    set((s) => ({ collapsedSubs: { ...s.collapsedSubs, [id]: !s.collapsedSubs[id] } })),

  collapseAll: (stepIds, subIds) =>
    set(() => ({
      collapsedSteps: Object.fromEntries(stepIds.map((id) => [id, true])),
      collapsedSubs: Object.fromEntries(subIds.map((id) => [id, true])),
    })),

  expandAll: () => set({ collapsedSteps: {}, collapsedSubs: {} }),
}));
