/**
 * Side-effecting capabilities that must pass through the permission broker.
 * Every tool declares the capability it needs.
 */
export type Capability =
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'shell.exec'
  | 'net.http'
  | 'git.write'
  | 'process.spawn'
  | 'integration.send'
  | 'mcp.call';

export type PermissionDecision = 'allow' | 'prompt' | 'deny';

export interface PermissionRequest {
  readonly capability: Capability;
  /** Human-readable description of the action, shown on prompt. */
  readonly summary: string;
  /** Resource the action targets (path, command, url). */
  readonly target?: string;
  /** Whether the action is classified as destructive/irreversible. */
  readonly destructive?: boolean;
}

export interface PermissionPolicyRule {
  readonly capability: Capability;
  /** Optional glob/regex applied to the request target. */
  readonly targetPattern?: string;
  readonly decision: PermissionDecision;
}

export interface PermissionGrant {
  readonly allowed: boolean;
  /** Why the request was allowed or denied. */
  readonly reason: string;
}

/**
 * Mediates all side effects. The agent never performs a gated action without
 * first obtaining a grant. On `prompt`, the broker asks the user (via the host)
 * and resolves once a decision is made.
 */
export interface PermissionBroker {
  evaluate(request: PermissionRequest): PermissionDecision;
  request(request: PermissionRequest): Promise<PermissionGrant>;
  /** Add a rule at runtime (e.g. "always allow reads in this repo"). */
  addRule(rule: PermissionPolicyRule): void;
}
