import { ForgewrightError } from '@forgewright/shared';
import type { LlmProvider, ModelRole, ModelRouter } from '@forgewright/types';

/**
 * Routes each model role to a provider. Built from a map of providers and a
 * role→providerId routing table. Falls back to the first provider if a role's
 * configured provider is missing (with a clear error if there are none).
 */
export class DefaultModelRouter implements ModelRouter {
  private readonly providers: Map<string, LlmProvider>;
  private readonly routes: Readonly<Record<ModelRole, string>>;

  constructor(providers: readonly LlmProvider[], routes: Readonly<Record<ModelRole, string>>) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
    this.routes = routes;
    if (this.providers.size === 0) {
      throw new ForgewrightError('CONFIG_INVALID', 'ModelRouter requires at least one provider');
    }
  }

  forRole(role: ModelRole): LlmProvider {
    const id = this.routes[role];
    const provider = this.providers.get(id);
    if (provider) return provider;
    const first = this.providers.values().next().value;
    if (!first) {
      throw new ForgewrightError('CONFIG_INVALID', `No provider available for role "${role}"`);
    }
    return first;
  }

  get(endpointId: string): LlmProvider | undefined {
    return this.providers.get(endpointId);
  }

  list(): readonly LlmProvider[] {
    return [...this.providers.values()];
  }
}
