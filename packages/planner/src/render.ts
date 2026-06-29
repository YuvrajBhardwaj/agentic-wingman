import type { Plan, PlanNode } from '@forgewright/types';

/** Render a plan as an indented checklist for inclusion in a prompt or the UI. */
export const renderPlan = (plan: Plan): string => {
  const lines: string[] = [];
  const walk = (node: PlanNode, depth: number): void => {
    if (depth > 0) {
      const box = node.status === 'done' ? '[x]' : '[ ]';
      lines.push(`${'  '.repeat(depth - 1)}- ${box} ${node.title}`);
    }
    for (const child of node.children) walk(child, depth + 1);
  };
  walk(plan.root, 0);
  return lines.join('\n');
};

/** All executable leaf tasks (nodes with no children), in order. */
export const planLeaves = (plan: Plan): readonly PlanNode[] => {
  const leaves: PlanNode[] = [];
  const walk = (node: PlanNode): void => {
    if (node.children.length === 0) {
      leaves.push(node);
      return;
    }
    for (const child of node.children) walk(child);
  };
  for (const child of plan.root.children) walk(child);
  return leaves;
};
