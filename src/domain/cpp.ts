import type { BehaviorNode, BehaviorTree, NodeDefinition } from "./types";

function sanitizeFunctionName(name: string) {
  const normalized = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return normalized.length > 0 ? normalized : "BehaviorTree";
}

function quoteString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatArg(value: string, type: string) {
  if (type === "string") return quoteString(value);
  return value;
}

function argsFor(node: BehaviorNode, definition: NodeDefinition) {
  return definition.params
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((param) => formatArg(node.params[param.name] ?? param.defaultValue ?? "", param.type))
    .join(", ");
}

function lineFor(node: BehaviorNode, definition: NodeDefinition, depth: number) {
  const indent = "    ".repeat(depth);
  const args = argsFor(node, definition);
  const suffix = args.length > 0 ? `(${args})` : "()";
  if (definition.category === "Composite") return `${indent}.composite<${definition.cpp}>${suffix}`;
  if (definition.category === "Decorator") return `${indent}.decorator<${definition.cpp}>${suffix}`;
  return `${indent}.leaf<${definition.cpp}>${suffix}`;
}

function emitNode(
  node: BehaviorNode,
  registry: Map<string, NodeDefinition>,
  depth: number,
  lines: string[]
) {
  const definition = registry.get(node.type);
  if (!definition) {
    lines.push(`${"    ".repeat(depth)}/* Unknown node: ${node.type} */`);
    return;
  }

  lines.push(lineFor(node, definition, depth));
  for (const child of node.children) {
    emitNode(child, registry, depth + 1, lines);
  }
  if (definition.category !== "Leaf") {
    lines.push(`${"    ".repeat(depth)}.end()`);
  }
}

export function generateCpp(tree: BehaviorTree, definitions: NodeDefinition[]) {
  const registry = new Map(definitions.map((definition) => [definition.name, definition]));
  const lines: string[] = [];
  emitNode(tree.root, registry, 0, lines);
  const chain = lines.join("\n") + ";";
  const functionName = `create${sanitizeFunctionName(tree.name)}Tree`;

  return [
    `#include "engine/game/brain.h"`,
    ``,
    `engine::brain::Tree * ${functionName}()`,
    `{`,
    `    using namespace engine::brain;`,
    ``,
    `    Builder builder;`,
    `    builder${chain}`,
    ``,
    `    return builder.build();`,
    `}`
  ].join("\n");
}
