import { create } from "zustand";
import type { BehaviorNode, BehaviorTree, DebugStatus, NodeDefinition } from "../domain/types";
import { createNodeFromDefinition } from "../domain/xml";

interface EditorState {
  baseDefinitions: NodeDefinition[];
  extraDefinitions: NodeDefinition[];
  definitions: NodeDefinition[];
  tree: BehaviorTree | null;
  selectedNodeId: string | null;
  activePreview: "xml" | "cpp" | "issues" | "debug";
  debugStatusOverrides: Record<string, DebugStatus>;
  setBaseDefinitions: (definitions: NodeDefinition[]) => void;
  mergeDefinitions: (definitions: NodeDefinition[]) => void;
  setTree: (tree: BehaviorTree) => void;
  selectNode: (id: string) => void;
  setActivePreview: (preview: EditorState["activePreview"]) => void;
  setTreeName: (name: string) => void;
  addChild: (parentId: string, definition: NodeDefinition) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, direction: -1 | 1) => void;
  updateParam: (id: string, name: string, value: string) => void;
  setDebugStatusOverride: (id: string, status: DebugStatus | "Auto") => void;
}

function visit(node: BehaviorNode, fn: (node: BehaviorNode, parent: BehaviorNode | null) => void, parent: BehaviorNode | null = null) {
  fn(node, parent);
  node.children.forEach((child) => visit(child, fn, node));
}

function updateTree(tree: BehaviorTree | null, updater: (root: BehaviorNode) => void) {
  if (!tree) return tree;
  const root = structuredClone(tree.root);
  updater(root);
  return { ...tree, root };
}

function mergeNodeDefinitions(baseDefinitions: NodeDefinition[], extraDefinitions: NodeDefinition[]) {
  const merged = new Map<string, NodeDefinition>();
  for (const definition of baseDefinitions) {
    merged.set(definition.name, definition);
  }
  for (const definition of extraDefinitions) {
    merged.set(definition.name, definition);
  }
  return Array.from(merged.values());
}

export const useEditorStore = create<EditorState>((set) => ({
  baseDefinitions: [],
  extraDefinitions: [],
  definitions: [],
  tree: null,
  selectedNodeId: null,
  activePreview: "xml",
  debugStatusOverrides: {},
  setBaseDefinitions: (baseDefinitions) =>
    set((state) => ({
      baseDefinitions,
      definitions: mergeNodeDefinitions(baseDefinitions, state.extraDefinitions)
    })),
  mergeDefinitions: (definitions) =>
    set((state) => {
      const byName = new Map(state.extraDefinitions.map((definition) => [definition.name, definition]));
      for (const definition of definitions) {
        byName.set(definition.name, definition);
      }
      const extraDefinitions = Array.from(byName.values());
      return {
        extraDefinitions,
        definitions: mergeNodeDefinitions(state.baseDefinitions, extraDefinitions)
      };
    }),
  setTree: (tree) => set({ tree, selectedNodeId: tree.root.id, debugStatusOverrides: {} }),
  selectNode: (id) => set({ selectedNodeId: id }),
  setActivePreview: (activePreview) => set({ activePreview }),
  setTreeName: (name) => set((state) => ({ tree: state.tree ? { ...state.tree, name } : state.tree })),
  addChild: (parentId, definition) =>
    set((state) => {
      const child = createNodeFromDefinition(definition);
      return {
        tree: updateTree(state.tree, (root) => {
          visit(root, (node) => {
            if (node.id === parentId) node.children.push(child);
          });
        }),
        selectedNodeId: child.id
      };
    }),
  removeNode: (id) =>
    set((state) => {
      if (!state.tree || state.tree.root.id === id) return {};
      let nextSelected = state.tree.root.id;
      return {
        tree: updateTree(state.tree, (root) => {
          visit(root, (node) => {
            node.children = node.children.filter((child) => {
              if (child.id === id) {
                nextSelected = node.id;
                return false;
              }
              return true;
            });
          });
        }),
        selectedNodeId: nextSelected,
        debugStatusOverrides: Object.fromEntries(
          Object.entries(state.debugStatusOverrides).filter(([nodeId]) => nodeId !== id)
        )
      };
    }),
  moveNode: (id, direction) =>
    set((state) => ({
      tree: updateTree(state.tree, (root) => {
        visit(root, (node) => {
          const index = node.children.findIndex((child) => child.id === id);
          if (index < 0) return;
          const next = index + direction;
          if (next < 0 || next >= node.children.length) return;
          const [child] = node.children.splice(index, 1);
          node.children.splice(next, 0, child);
        });
      })
    })),
  updateParam: (id, name, value) =>
    set((state) => ({
      tree: updateTree(state.tree, (root) => {
        visit(root, (node) => {
          if (node.id === id) node.params[name] = value;
        });
      })
    })),
  setDebugStatusOverride: (id, status) =>
    set((state) => {
      const debugStatusOverrides = { ...state.debugStatusOverrides };
      if (status === "Auto") delete debugStatusOverrides[id];
      else debugStatusOverrides[id] = status;
      return { debugStatusOverrides };
    })
}));
