import type { BehaviorNode, DebugStatus, DebugTraceEvent, NodeDefinition } from "./types";

interface DebugContext {
  registry: Map<string, NodeDefinition>;
  overrides: Record<string, DebugStatus>;
  events: DebugTraceEvent[];
}

function pushEvent(
  context: DebugContext,
  node: BehaviorNode,
  depth: number,
  status: DebugStatus,
  note: string
) {
  const definition = context.registry.get(node.type);
  context.events.push({
    order: context.events.length + 1,
    nodeId: node.id,
    depth,
    type: node.type,
    displayName: definition?.displayName ?? node.type,
    category: definition?.category ?? "Unknown",
    status,
    note
  });
}

function invert(status: DebugStatus): DebugStatus {
  if (status === "Success") return "Failure";
  if (status === "Failure") return "Success";
  return status;
}

function simulateLeaf(context: DebugContext, node: BehaviorNode, depth: number): DebugStatus {
  const override = context.overrides[node.id];
  const status = override ?? "Success";
  pushEvent(
    context,
    node,
    depth,
    status,
    override ? `Leaf 使用调试覆盖值 ${override}。` : "Leaf 默认模拟为 Success。"
  );
  return status;
}

function simulateDecorator(context: DebugContext, node: BehaviorNode, depth: number): DebugStatus {
  const child = node.children[0];
  const childStatus = child ? simulateNode(context, child, depth + 1) : "Invalid";
  let status: DebugStatus = childStatus;
  let note = "Decorator 返回子节点状态。";

  if (node.type === "Inverter") {
    status = invert(childStatus);
    note = "Inverter 反转 Success/Failure。";
  } else if (node.type === "Succeeder") {
    status = "Success";
    note = "Succeeder 忽略子节点结果，强制 Success。";
  } else if (node.type === "Failer") {
    status = "Failure";
    note = "Failer 忽略子节点结果，强制 Failure。";
  } else if (node.type === "Runner") {
    status = "Running";
    note = "Runner 忽略子节点结果，强制 Running。";
  } else if (node.type === "Repeater") {
    status = "Running";
    note = "Repeater 在未达到次数限制前返回 Running。";
  } else if (node.type === "Duration") {
    status = childStatus === "Failure" ? "Success" : "Running";
    note = "Duration 子节点 Failure 时结束，否则模拟为 Running。";
  } else if (node.type === "UntilSuccess") {
    status = childStatus === "Success" ? "Success" : "Running";
    note = "UntilSuccess 直到子节点 Success 才结束。";
  } else if (node.type === "UntilFailure") {
    status = childStatus === "Failure" ? "Success" : "Running";
    note = "UntilFailure 直到子节点 Failure 才结束。";
  }

  pushEvent(context, node, depth, status, note);
  return status;
}

function simulateComposite(context: DebugContext, node: BehaviorNode, depth: number): DebugStatus {
  if (node.type === "Sequence") {
    for (const child of node.children) {
      const status = simulateNode(context, child, depth + 1);
      if (status !== "Success") {
        pushEvent(context, node, depth, status, "Sequence 遇到非 Success 后停止。");
        return status;
      }
    }
    pushEvent(context, node, depth, "Success", "Sequence 所有子节点 Success。");
    return "Success";
  }

  if (node.type === "Selector") {
    for (const child of node.children) {
      const status = simulateNode(context, child, depth + 1);
      if (status !== "Failure") {
        pushEvent(context, node, depth, status, "Selector 遇到非 Failure 后停止。");
        return status;
      }
    }
    pushEvent(context, node, depth, "Failure", "Selector 所有子节点 Failure。");
    return "Failure";
  }

  if (node.type === "IfElse") {
    const condition = node.children[0] ? simulateNode(context, node.children[0], depth + 1) : "Invalid";
    const branch = condition === "Success" ? node.children[1] : node.children[2];
    const status = branch ? simulateNode(context, branch, depth + 1) : "Invalid";
    pushEvent(context, node, depth, status, condition === "Success" ? "IfElse 条件成功，执行 then 分支。" : "IfElse 条件失败，执行 else 分支。");
    return status;
  }

  if (node.type === "Priority") {
    const first = node.children[0] ? simulateNode(context, node.children[0], depth + 1) : "Invalid";
    if (first === "Success") {
      pushEvent(context, node, depth, first, "Priority 首个子节点 Success，后续不执行。");
      return first;
    }
    for (const child of node.children.slice(1)) {
      simulateNode(context, child, depth + 1);
    }
    pushEvent(context, node, depth, first, "Priority 首个子节点非 Success，执行后续子节点但返回首个结果。");
    return first;
  }

  if (node.type === "Parallel") {
    let successCount = 0;
    let failureCount = 0;
    for (const child of node.children) {
      const status = simulateNode(context, child, depth + 1);
      if (status === "Success") successCount += 1;
      if (status === "Failure") failureCount += 1;
    }
    const status: DebugStatus = failureCount > 0 ? "Failure" : successCount === node.children.length ? "Success" : "Running";
    pushEvent(context, node, depth, status, "Parallel 模拟执行所有子节点。");
    return status;
  }

  for (const child of node.children) {
    simulateNode(context, child, depth + 1);
  }
  pushEvent(context, node, depth, "Success", "未知 Composite 按顺序执行所有子节点。");
  return "Success";
}

function simulateNode(context: DebugContext, node: BehaviorNode, depth: number): DebugStatus {
  const definition = context.registry.get(node.type);
  if (!definition) {
    pushEvent(context, node, depth, "Invalid", "未知节点，无法模拟。");
    return "Invalid";
  }
  if (definition.category === "Leaf") return simulateLeaf(context, node, depth);
  if (definition.category === "Decorator") return simulateDecorator(context, node, depth);
  return simulateComposite(context, node, depth);
}

export function generateDebugTrace(
  root: BehaviorNode,
  definitions: NodeDefinition[],
  overrides: Record<string, DebugStatus> = {}
) {
  const context: DebugContext = {
    registry: new Map(definitions.map((definition) => [definition.name, definition])),
    overrides,
    events: []
  };
  simulateNode(context, root, 0);
  return context.events;
}
