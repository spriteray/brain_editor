import type { BehaviorNode, BehaviorTree, NodeDefinition, NodeParamDefinition, NodeCategory, NodeConstruct } from "./types";

const BUILTIN_LEAF_TAG = "Leaf";

function attr(element: Element, name: string, fallback = "") {
  return element.getAttribute(name) ?? fallback;
}

function childElements(element: Element) {
  return Array.from(element.children);
}

function makeId() {
  return crypto.randomUUID();
}

function parseParamDefinition(element: Element): NodeParamDefinition {
  const values = attr(element, "values")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    name: attr(element, "name"),
    type: attr(element, "type", "string") as NodeParamDefinition["type"],
    defaultValue: element.getAttribute("default") ?? undefined,
    order: Number(attr(element, "order", "0")),
    displayName: element.getAttribute("displayName") ?? undefined,
    values: values.length > 0 ? values : undefined
  };
}

export function parseNodeRegistry(xml: string): NodeDefinition[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const errorNode = doc.querySelector("parsererror");
  if (errorNode) throw new Error(errorNode.textContent ?? "Invalid node registry XML.");

  return Array.from(doc.querySelectorAll("BrainNodeRegistry > Node")).map((element) => {
    const children = element.querySelector(":scope > Children");
    const displayName = element.querySelector(":scope > DisplayName")?.textContent?.trim();
    const description = element.querySelector(":scope > Description")?.textContent?.trim();
    const params = Array.from(element.querySelectorAll(":scope > Param"))
      .map(parseParamDefinition)
      .sort((a, b) => a.order - b.order);

    return {
      name: attr(element, "name"),
      category: attr(element, "category") as NodeCategory,
      construct: attr(element, "construct", "class") as NodeConstruct,
      folder: attr(element, "folder", attr(element, "category", "未分类")),
      cpp: attr(element, "cpp", attr(element, "name")),
      displayName: displayName || attr(element, "name"),
      description,
      children: {
        min: Number(children?.getAttribute("min") ?? "0"),
        max: (children?.getAttribute("max") ?? "0") === "*" ? "*" : Number(children?.getAttribute("max") ?? "0")
      },
      params
    };
  });
}

export function createNodeFromDefinition(definition: NodeDefinition): BehaviorNode {
  const params: Record<string, string> = {};
  for (const param of definition.params) {
    params[param.name] = param.defaultValue ?? "";
    if (param.type === "bool") {
      params[param.name] = param.defaultValue === "true" ? "1" : param.defaultValue === "false" ? "0" : params[param.name];
    }
  }
  return {
    id: makeId(),
    type: definition.name,
    params,
    children: []
  };
}

function parseBehaviorNode(element: Element): BehaviorNode {
  const isLeaf = element.tagName === BUILTIN_LEAF_TAG;
  const type = isLeaf ? attr(element, "type") : element.tagName;
  const params: Record<string, string> = {};

  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name !== "type") {
      params[attribute.name] = attribute.value;
    }
  }

  for (const paramElement of Array.from(element.querySelectorAll(":scope > Param"))) {
    params[attr(paramElement, "name")] = attr(paramElement, "value");
  }

  const children = childElements(element)
    .filter((child) => child.tagName !== "Param")
    .map(parseBehaviorNode);

  return { id: makeId(), type, params, children };
}

export function parseBehaviorTree(xml: string): BehaviorTree {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const errorNode = doc.querySelector("parsererror");
  if (errorNode) throw new Error(errorNode.textContent ?? "Invalid behavior tree XML.");

  const tree = doc.querySelector("BehaviorTree");
  if (!tree) throw new Error("Missing BehaviorTree root.");
  const rootElement = childElements(tree).find((child) => child.tagName !== "Param");
  if (!rootElement) throw new Error("BehaviorTree has no root node.");

  return {
    name: attr(tree, "name", "NewBehaviorTree"),
    root: parseBehaviorNode(rootElement)
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nodeToXml(node: BehaviorNode, registry: Map<string, NodeDefinition>, depth: number): string {
  const definition = registry.get(node.type);
  const indent = "  ".repeat(depth);
  const params = definition?.params ?? [];
  const attrs = params
    .filter((param) => node.params[param.name] !== undefined && node.params[param.name] !== "")
    .map((param) => {
      const rawValue = node.params[param.name];
      const value = param.type === "bool"
        ? rawValue === "true" || rawValue === "1" ? "1" : "0"
        : rawValue;
      return `${param.name}="${escapeXml(value)}"`;
    })
    .join(" ");

  const tag = definition?.category === "Leaf" ? BUILTIN_LEAF_TAG : node.type;
  const typeAttr = definition?.category === "Leaf" ? `type="${escapeXml(node.type)}"` : "";
  const fullAttrs = [typeAttr, attrs].filter(Boolean).join(" ");
  const open = fullAttrs.length > 0 ? `<${tag} ${fullAttrs}>` : `<${tag}>`;

  if (node.children.length === 0) {
    return `${indent}${open.replace(/>$/, " />")}`;
  }

  const children = node.children.map((child) => nodeToXml(child, registry, depth + 1)).join("\n");
  return `${indent}${open}\n${children}\n${indent}</${tag}>`;
}

export function behaviorTreeToXml(tree: BehaviorTree, definitions: NodeDefinition[]) {
  const registry = new Map(definitions.map((definition) => [definition.name, definition]));
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<BehaviorTree name="${escapeXml(tree.name)}">`,
    nodeToXml(tree.root, registry, 1),
    `</BehaviorTree>`
  ].join("\n");
}
