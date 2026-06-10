import type { BehaviorNode, BehaviorTree, NodeDefinition, ValidationIssue } from "./types";

function issue(nodeId: string, message: string, level: ValidationIssue["level"] = "error"): ValidationIssue {
  return { nodeId, message, level };
}

function validateParamValue(value: string, type: string, values?: string[]) {
  if (type === "bool") return value === "1" || value === "0";
  if (type === "int") return /^-?\d+$/.test(value);
  if (type === "float") return /^-?\d+(\.\d+)?$/.test(value);
  if (type === "enum") return values?.includes(value) ?? false;
  return true;
}

function validateNode(
  node: BehaviorNode,
  registry: Map<string, NodeDefinition>,
  issues: ValidationIssue[]
) {
  const definition = registry.get(node.type);
  if (!definition) {
    issues.push(issue(node.id, `Unknown node: ${node.type}`));
    return;
  }

  const count = node.children.length;
  const max = definition.children.max;
  if (count < definition.children.min) {
    issues.push(issue(node.id, `${definition.name} needs at least ${definition.children.min} child node(s).`));
  }
  if (max !== "*" && count > max) {
    issues.push(issue(node.id, `${definition.name} allows at most ${max} child node(s).`));
  }

  for (const param of definition.params) {
    const value = node.params[param.name] ?? "";
    if (value === "") {
      issues.push(issue(node.id, `${definition.name}.${param.name} is empty.`, param.defaultValue ? "warning" : "error"));
      continue;
    }
    if (!validateParamValue(value, param.type, param.values)) {
      issues.push(issue(node.id, `${definition.name}.${param.name} must be ${param.type}.`));
    }
  }

  for (const child of node.children) {
    validateNode(child, registry, issues);
  }
}

export function validateTree(tree: BehaviorTree, definitions: NodeDefinition[]) {
  const registry = new Map(definitions.map((definition) => [definition.name, definition]));
  const issues: ValidationIssue[] = [];
  validateNode(tree.root, registry, issues);
  return issues;
}
