import type { LlmConfig, LlmEndpointConfig, LlmProvider } from '@forgewright/types';

import { OllamaProvider } from './ollama-provider.js';
import { OpenAiCompatibleProvider } from './openai-provider.js';
import { DefaultModelRouter } from './router.js';

/** Construct a provider from a single endpoint config. */
export const createProvider = (
  endpoint: LlmEndpointConfig,
  fetchImpl?: typeof fetch,
): LlmProvider => {
  if (endpoint.kind === 'ollama') {
    return new OllamaProvider({
      id: endpoint.id,
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  return new OpenAiCompatibleProvider({
    id: endpoint.id,
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
};

/** Build a fully-wired model router from the LLM config. */
export const createModelRouter = (
  config: LlmConfig,
  fetchImpl?: typeof fetch,
): DefaultModelRouter => {
  const providers = config.endpoints.map((e) => createProvider(e, fetchImpl));
  return new DefaultModelRouter(providers, config.routes);
};
