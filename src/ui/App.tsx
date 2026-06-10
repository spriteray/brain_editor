import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileCode2, FolderOpen, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { behaviorTreeToXml, createNodeFromDefinition, parseBehaviorTree, parseNodeRegistry } from "../domain/xml";
import { validateTree } from "../domain/validate";
import { generateDebugTrace } from "../domain/debug";
import type { BehaviorNode, DebugStatus, NodeDefinition } from "../domain/types";
import defaultRegistryXml from "../assets/default_brain_nodes.xml?raw";

function findNode(root: BehaviorNode | null | undefined, id: string | null): BehaviorNode | null {
  if (!root || !id) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParentIds(root: BehaviorNode | null | undefined, id: string | null): Set<string> {
  const parents = new Set<string>();
  if (!root || !id) return parents;

  function visit(node: BehaviorNode, path: string[]): boolean {
    if (node.id === id) {
      path.forEach((parentId) => parents.add(parentId));
      return true;
    }
    return node.children.some((child) => visit(child, [...path, node.id]));
  }

  visit(root, []);
  return parents;
}

function findChildIds(node: BehaviorNode | null): Set<string> {
  return new Set(node?.children.map((child) => child.id) ?? []);
}

function groupDefinitions(definitions: NodeDefinition[]) {
  return definitions.reduce<LibraryFolder>((root, definition) => {
    const parts = definition.folder
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    const pathParts = parts.length > 0 ? parts : ["未分类"];
    let current = root;
    for (const part of pathParts) {
      current.children[part] ??= createLibraryFolder(part);
      current = current.children[part];
    }
    current.nodes.push(definition);
    return root;
  }, createLibraryFolder(""));
}

interface LibraryFolder {
  name: string;
  nodes: NodeDefinition[];
  children: Record<string, LibraryFolder>;
}

function createLibraryFolder(name: string): LibraryFolder {
  return { name, nodes: [], children: {} };
}

function countFolderNodes(folder: LibraryFolder): number {
  return Object.values(folder.children).reduce((count, child) => count + countFolderNodes(child), folder.nodes.length);
}

function sortedFolders(folder: LibraryFolder) {
  return Object.values(folder.children).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function collectFolderPaths(folder: LibraryFolder, parentPath = ""): string[] {
  return sortedFolders(folder).flatMap((child) => {
    const path = parentPath ? `${parentPath}/${child.name}` : child.name;
    return [path, ...collectFolderPaths(child, path)];
  });
}

function canAcceptChild(parent: BehaviorNode, definitions: NodeDefinition[]) {
  const definition = definitions.find((item) => item.name === parent.type);
  if (!definition) return false;
  return definition.children.max === "*" || parent.children.length < definition.children.max;
}

function Header() {
  const { tree, setTree, mergeDefinitions, setTreeName } = useEditorStore();
  const [filePath, setFilePath] = useState<string>("");

  const openTree = async () => {
    const result = await window.brainApi?.openTextFile();
    if (!result) return;
    setTree(parseBehaviorTree(result.content));
    setFilePath(result.filePath);
  };

  const saveTree = async () => {
    const state = useEditorStore.getState();
    if (!state.tree) return;
    const xml = behaviorTreeToXml(state.tree, state.definitions);
    if (filePath && window.brainApi) {
      await window.brainApi.writeTextFile(filePath, xml);
      return;
    }
    const saved = await window.brainApi?.saveTextFile(`${state.tree.name}.xml`, xml);
    if (saved) setFilePath(saved);
  };

  const loadRegistry = async () => {
    const result = await window.brainApi?.openNodeDefinitionFile();
    if (!result) return;
    mergeDefinitions(parseNodeRegistry(result.content));
  };

  return (
    <header className="app-header">
      <div className="brand">
        <FileCode2 size={22} />
        <div>
          <strong>BrainEditor</strong>
          <span>engine::brain</span>
        </div>
      </div>
      <label className="tree-name">
        <span>树名</span>
        <input value={tree?.name ?? ""} onChange={(event) => setTreeName(event.target.value)} />
      </label>
      <div className="header-actions">
        <button onClick={loadRegistry} title="追加节点定义 XML，同名节点会覆盖默认定义">
          <FolderOpen size={17} />
          追加节点
        </button>
        <button onClick={openTree} title="打开行为树 XML">
          <FolderOpen size={17} />
          打开树
        </button>
        <button onClick={saveTree} title="保存行为树 XML">
          <Save size={17} />
          保存树
        </button>
      </div>
    </header>
  );
}

function NodeLibrary() {
  const definitions = useEditorStore((state) => state.definitions);
  const tree = useEditorStore((state) => state.tree);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const addChild = useEditorStore((state) => state.addChild);
  const [query, setQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const filteredDefinitions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return definitions;
    return definitions.filter((definition) => {
      return [
        definition.name,
        definition.cpp,
        definition.displayName,
        definition.description ?? "",
        definition.category,
        definition.folder
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [definitions, query]);
  const rootFolder = useMemo(() => groupDefinitions(filteredDefinitions), [filteredDefinitions]);
  const selected = findNode(tree?.root, selectedNodeId);
  const accepts = selected ? canAcceptChild(selected, definitions) : false;
  const isSearching = query.trim().length > 0;

  useEffect(() => {
    const allFolders = collectFolderPaths(groupDefinitions(definitions));
    setCollapsedFolders(new Set(allFolders));
  }, [definitions]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };
  const folderCount = countFolderNodes(rootFolder);

  const renderNodeButton = (definition: NodeDefinition) => (
    <button
      key={definition.name}
      className="library-node"
      disabled={!selected || !accepts}
      onClick={() => selected && addChild(selected.id, definition)}
      title={definition.description || definition.name}
    >
      <span>{definition.displayName}</span>
      <small>{definition.name}</small>
    </button>
  );

  const renderFolder = (folder: LibraryFolder, depth: number, parentPath: string) => {
    const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
    const collapsed = !isSearching && collapsedFolders.has(folderPath);
    const count = countFolderNodes(folder);
    const childFolders = sortedFolders(folder);

    return (
      <section key={folderPath} className="library-section">
        <button
          className="library-folder"
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => toggleFolder(folderPath)}
          title={collapsed ? "展开目录" : "折叠目录"}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <span>{folder.name}</span>
          <small>{count}</small>
        </button>
        {!collapsed && (
          <>
            {childFolders.map((child) => renderFolder(child, depth + 1, folderPath))}
            <div className="library-node-list" style={{ paddingLeft: depth * 14 }}>
              {folder.nodes
                .slice()
                .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-CN"))
                .map(renderNodeButton)}
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <aside className="library">
      <div className="panel-title">
        节点库
        <small>{definitions.length}</small>
      </div>
      <label className="node-search">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" />
      </label>
      {sortedFolders(rootFolder).map((folder) => renderFolder(folder, 0, ""))}
      {rootFolder.nodes.length > 0 && rootFolder.nodes.map(renderNodeButton)}
      {folderCount === 0 && <div className="empty-group">无匹配节点</div>}
    </aside>
  );
}

function TreeNodeView({
  node,
  depth,
  collapsedNodeIds,
  parentHighlightIds,
  childHighlightIds,
  onToggle
}: {
  node: BehaviorNode;
  depth: number;
  collapsedNodeIds: Set<string>;
  parentHighlightIds: Set<string>;
  childHighlightIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { definitions, selectedNodeId, selectNode, removeNode, moveNode } = useEditorStore();
  const definition = definitions.find((item) => item.name === node.type);
  const selected = selectedNodeId === node.id;
  const isParentHighlight = parentHighlightIds.has(node.id);
  const isChildHighlight = childHighlightIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedNodeIds.has(node.id);
  const className = [
    "tree-node",
    selected ? "selected" : "",
    isParentHighlight ? "parent-highlight" : "",
    isChildHighlight ? "child-highlight" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className="tree-node-wrap">
      <div
        className={className}
        style={{ marginLeft: depth * 22 }}
        onClick={() => selectNode(node.id)}
      >
        <button
          className="node-fold"
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
          title={collapsed ? "展开节点" : "折叠节点"}
        >
          {hasChildren && collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className={`node-kind ${definition?.category.toLowerCase() ?? "unknown"}`}>{definition?.category ?? "?"}</span>
        <div className="node-main">
          <strong>{definition?.displayName ?? node.type}</strong>
          <span>{node.type}</span>
        </div>
        <div className="node-actions">
          <button onClick={(event) => { event.stopPropagation(); moveNode(node.id, -1); }} title="上移">
            <ArrowUp size={14} />
          </button>
          <button onClick={(event) => { event.stopPropagation(); moveNode(node.id, 1); }} title="下移">
            <ArrowDown size={14} />
          </button>
          <button onClick={(event) => { event.stopPropagation(); removeNode(node.id); }} title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {!collapsed && node.children.map((child) => (
        <TreeNodeView
          key={child.id}
          node={child}
          depth={depth + 1}
          collapsedNodeIds={collapsedNodeIds}
          parentHighlightIds={parentHighlightIds}
          childHighlightIds={childHighlightIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function TreePanel() {
  const tree = useEditorStore((state) => state.tree);
  const definitions = useEditorStore((state) => state.definitions);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const setTree = useEditorStore((state) => state.setTree);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const selectedNode = findNode(tree?.root, selectedNodeId);
  const parentHighlightIds = findParentIds(tree?.root, selectedNodeId);
  const childHighlightIds = findChildIds(selectedNode);

  const newTree = () => {
    const rootDef = definitions.find((definition) => definition.name === "Sequence") ?? definitions[0];
    if (!rootDef) return;
    setTree({ name: "NewBehaviorTree", root: createNodeFromDefinition(rootDef) });
    setCollapsedNodeIds(new Set());
  };

  const toggleNode = (id: string) => {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="tree-panel">
      <div className="tree-toolbar">
        <div>
          <strong>{tree?.name ?? "未命名"}</strong>
          <span>{tree ? "BehaviorTree" : ""}</span>
        </div>
        <button onClick={newTree} title="新建">
          <Plus size={16} />
          新建
        </button>
      </div>
      <div className="tree-canvas">
        {tree ? (
          <TreeNodeView
            node={tree.root}
            depth={0}
            collapsedNodeIds={collapsedNodeIds}
            parentHighlightIds={parentHighlightIds}
            childHighlightIds={childHighlightIds}
            onToggle={toggleNode}
          />
        ) : (
          <div className="empty-tree">
            <strong>未打开行为树</strong>
            <span>可以打开已有 XML，或新建一棵树。</span>
            <button onClick={newTree} title="新建行为树">
              <Plus size={16} />
              新建行为树
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function PropertyPanel() {
  const {
    definitions,
    tree,
    selectedNodeId,
    updateParam,
    debugStatusOverrides,
    setDebugStatusOverride,
    setActivePreview
  } = useEditorStore();
  const node = findNode(tree?.root, selectedNodeId);
  const definition = definitions.find((item) => item.name === node?.type);

  if (!node || !definition) {
    return (
      <aside className="properties">
        <div className="panel-title">属性</div>
      </aside>
    );
  }

  return (
    <aside className="properties">
      <div className="panel-title">属性</div>
      <div className="prop-head">
        <span className={`node-kind ${definition.category.toLowerCase()}`}>{definition.category}</span>
        <div>
          <strong>{definition.displayName}</strong>
          <small>{definition.cpp} · {definition.construct}</small>
        </div>
      </div>
      <div className="param-list">
        {definition.params.map((param) => (
          <label key={param.name} className="param-field">
            <span>{param.displayName ?? param.name}</span>
            {param.type === "bool" ? (
              <select value={node.params[param.name] ?? ""} onChange={(event) => updateParam(node.id, param.name, event.target.value)}>
                <option value="1">true</option>
                <option value="0">false</option>
              </select>
            ) : param.type === "enum" ? (
              <select value={node.params[param.name] ?? ""} onChange={(event) => updateParam(node.id, param.name, event.target.value)}>
                {param.values?.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            ) : (
              <input
                value={node.params[param.name] ?? ""}
                onChange={(event) => updateParam(node.id, param.name, event.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {definition.category === "Leaf" && (
        <div className="debug-control">
          <div className="panel-title">
            调试
            <small>Leaf</small>
          </div>
          <label className="param-field">
            <span>模拟返回值</span>
            <select
              value={debugStatusOverrides[node.id] ?? "Auto"}
              onChange={(event) => {
                setDebugStatusOverride(node.id, event.target.value as DebugStatus | "Auto");
                setActivePreview("debug");
              }}
            >
              <option value="Auto">自动 Success</option>
              <option value="Success">Success</option>
              <option value="Failure">Failure</option>
              <option value="Running">Running</option>
            </select>
          </label>
        </div>
      )}
    </aside>
  );
}

function PreviewPanel() {
  const { definitions, tree, activePreview, setActivePreview, selectNode, debugStatusOverrides } = useEditorStore();
  const [expanded, setExpanded] = useState(false);
  const [panelHeight, setPanelHeight] = useState(270);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);
  const xml = tree ? behaviorTreeToXml(tree, definitions) : "";
  const issues = tree ? validateTree(tree, definitions) : [];
  const trace = tree ? generateDebugTrace(tree.root, definitions, debugStatusOverrides) : [];

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragState.current) return;
      const delta = dragState.current.startY - event.clientY;
      const maxHeight = Math.max(260, window.innerHeight - 180);
      const nextHeight = Math.min(maxHeight, Math.max(180, dragState.current.startHeight + delta));
      setPanelHeight(nextHeight);
    };
    const onPointerUp = () => {
      dragState.current = null;
      document.body.classList.remove("resizing-preview");
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!expanded) setExpanded(true);
    dragState.current = { startY: event.clientY, startHeight: panelHeight };
    document.body.classList.add("resizing-preview");
  };

  return (
    <section className={`preview ${expanded ? "expanded" : "collapsed"}`} style={expanded ? { height: panelHeight } : undefined}>
      {expanded && <div className="preview-resizer" onPointerDown={startResize} title="拖拽调整面板高度" />}
      <div className="preview-bar">
        <button className="preview-toggle" onClick={() => setExpanded((value) => !value)} title={expanded ? "收起底部面板" : "展开底部面板"}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          预览/调试
        </button>
        <div className="preview-tabs">
          <button className={activePreview === "xml" ? "active" : ""} onClick={() => { setActivePreview("xml"); setExpanded(true); }}>XML</button>
          <button className={activePreview === "issues" ? "active" : ""} onClick={() => { setActivePreview("issues"); setExpanded(true); }}>校验 {issues.length}</button>
          <button className={activePreview === "debug" ? "active" : ""} onClick={() => { setActivePreview("debug"); setExpanded(true); }}>调试 {trace.length}</button>
        </div>
      </div>
      {expanded && (
        <div className="preview-body">
          {activePreview === "xml" && <pre>{xml}</pre>}
          {activePreview === "issues" && (
            <div className="issues">
              {issues.length === 0 ? (
                <div className="issue ok">校验通过</div>
              ) : (
                issues.map((item, index) => <div className={`issue ${item.level}`} key={`${item.nodeId}-${index}`}>{item.message}</div>)
              )}
            </div>
          )}
          {activePreview === "debug" && (
            <div className="debug-trace">
              <div className="debug-hint">单 Tick 模拟执行顺序。Leaf 默认返回 Success，后续可以扩展为手动指定返回值。</div>
              {trace.map((event) => (
                <button
                  key={`${event.nodeId}-${event.order}`}
                  className="debug-row"
                  style={{ paddingLeft: 10 + event.depth * 18 }}
                  onClick={() => selectNode(event.nodeId)}
                  title="选中该节点"
                >
                  <span className="debug-order">{event.order}</span>
                  <span className={`debug-status ${event.status.toLowerCase()}`}>{event.status}</span>
                  <span className="debug-node">
                    <strong>{event.displayName}</strong>
                    <small>{event.type}</small>
                  </span>
                  <span className="debug-note">{event.note}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function App() {
  const setBaseDefinitions = useEditorStore((state) => state.setBaseDefinitions);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let canceled = false;

    async function loadNodeRegistry() {
      try {
        const xml = await window.brainApi?.readAssetText("config/brain_nodes.xml").catch(() => defaultRegistryXml);
        if (!canceled) setBaseDefinitions(parseNodeRegistry(xml ?? defaultRegistryXml));
      } catch (error) {
        if (!canceled) {
          setBaseDefinitions(parseNodeRegistry(defaultRegistryXml));
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadNodeRegistry();
    return () => {
      canceled = true;
    };
  }, [setBaseDefinitions]);

  return (
    <div className="app-shell">
      <Header />
      {loadError && <div className="load-error">{loadError}</div>}
      <div className="workspace">
        <NodeLibrary />
        <TreePanel />
        <PropertyPanel />
      </div>
      <PreviewPanel />
    </div>
  );
}
