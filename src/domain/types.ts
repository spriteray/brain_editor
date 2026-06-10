export type NodeCategory = "Composite" | "Decorator" | "Leaf";
export type ParamType = "bool" | "int" | "float" | "string" | "enum";
export type NodeConstruct = "class" | "static";

export interface NodeParamDefinition {
  name: string;
  type: ParamType;
  defaultValue?: string;
  order: number;
  displayName?: string;
  values?: string[];
}

export interface ChildrenRule {
  min: number;
  max: number | "*";
}

export interface NodeDefinition {
  name: string;
  cpp: string;
  category: NodeCategory;
  construct: NodeConstruct;
  folder: string;
  displayName: string;
  description?: string;
  children: ChildrenRule;
  params: NodeParamDefinition[];
}

export interface BehaviorNode {
  id: string;
  type: string;
  params: Record<string, string>;
  children: BehaviorNode[];
}

export interface BehaviorTree {
  name: string;
  root: BehaviorNode;
}

export interface ValidationIssue {
  nodeId: string;
  message: string;
  level: "error" | "warning";
}

export type DebugStatus = "Success" | "Failure" | "Running" | "Invalid";

export interface DebugTraceEvent {
  order: number;
  nodeId: string;
  depth: number;
  type: string;
  displayName: string;
  category: NodeCategory | "Unknown";
  status: DebugStatus;
  note: string;
}
