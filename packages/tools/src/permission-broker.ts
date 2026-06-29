import type {
  Capability,
  Logger,
  PermissionBroker,
  PermissionDecision,
  PermissionGrant,
  PermissionPolicyRule,
  PermissionRequest,
} from '@forgewright/types';

/** Asks the host/user to approve a prompted action. Returns the decision. */
export type Approver = (request: PermissionRequest) => Promise<boolean>;

/** Default decision per capability when no rule matches. */
const DEFAULT_DECISIONS: Record<Capability, PermissionDecision> = {
  'fs.read': 'allow',
  'fs.write': 'prompt',
  'fs.delete': 'prompt',
  'shell.exec': 'prompt',
  'net.http': 'prompt',
  'git.write': 'prompt',
  'process.spawn': 'prompt',
  'integration.send': 'prompt',
  'mcp.call': 'prompt',
};

const matchesTarget = (pattern: string | undefined, target: string | undefined): boolean => {
  if (pattern === undefined) return true;
  if (target === undefined) return false;
  // Glob-ish: `*` matches any run of characters.
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );
  return regex.test(target);
};

export interface PermissionBrokerOptions {
  readonly rules?: readonly PermissionPolicyRule[];
  readonly approver?: Approver;
  readonly logger?: Logger;
}

/** Deny-on-prompt by default, so non-interactive hosts fail safe. */
const denyingApprover: Approver = async () => false;

/**
 * Policy-driven permission broker. Rules are evaluated in order; the first whose
 * capability and target pattern match wins. Destructive actions can never be
 * silently allowed — they are forced to at least `prompt`.
 */
export class DefaultPermissionBroker implements PermissionBroker {
  private readonly rules: PermissionPolicyRule[];
  private readonly approver: Approver;
  private readonly logger: Logger | undefined;

  constructor(options: PermissionBrokerOptions = {}) {
    this.rules = [...(options.rules ?? [])];
    this.approver = options.approver ?? denyingApprover;
    this.logger = options.logger;
  }

  evaluate(request: PermissionRequest): PermissionDecision {
    for (const rule of this.rules) {
      if (
        rule.capability === request.capability &&
        matchesTarget(rule.targetPattern, request.target)
      ) {
        // A destructive action is never auto-allowed by a broad rule.
        if (request.destructive && rule.decision === 'allow') return 'prompt';
        return rule.decision;
      }
    }
    const base = DEFAULT_DECISIONS[request.capability];
    if (request.destructive && base === 'allow') return 'prompt';
    return base;
  }

  async request(request: PermissionRequest): Promise<PermissionGrant> {
    const decision = this.evaluate(request);
    this.logger?.debug('permission_evaluate', {
      capability: request.capability,
      target: request.target,
      decision,
    });

    if (decision === 'allow') {
      return { allowed: true, reason: 'allowed by policy' };
    }
    if (decision === 'deny') {
      return { allowed: false, reason: 'denied by policy' };
    }

    const approved = await this.approver(request);
    return approved
      ? { allowed: true, reason: 'approved by user' }
      : { allowed: false, reason: 'rejected by user' };
  }

  addRule(rule: PermissionPolicyRule): void {
    this.rules.push(rule);
  }
}
