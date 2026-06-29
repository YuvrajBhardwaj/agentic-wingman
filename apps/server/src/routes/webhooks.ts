import { parseWhatsAppWebhook } from '@forgewright/integrations';
import type { Logger } from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

export interface InboundMessage {
  readonly id: string;
  readonly from: string;
  readonly text: string;
  readonly timestamp: number;
}

export interface WebhookRouteDeps {
  readonly logger: Logger;
  readonly onInbound: (channel: string, messages: readonly InboundMessage[]) => void;
  /** WhatsApp webhook verify token (Meta echoes hub.challenge when it matches). */
  readonly whatsappVerifyToken?: string;
}

export const registerWebhookRoutes = (app: FastifyInstance, deps: WebhookRouteDeps): void => {
  // Meta webhook verification handshake.
  app.get<{ Querystring: Record<string, string> }>(
    '/integrations/webhooks/whatsapp',
    async (request, reply) => {
      const q = request.query;
      if (
        deps.whatsappVerifyToken &&
        q['hub.mode'] === 'subscribe' &&
        q['hub.verify_token'] === deps.whatsappVerifyToken
      ) {
        return reply.type('text/plain').send(q['hub.challenge'] ?? '');
      }
      return reply.status(403).send({ error: { message: 'verification failed' } });
    },
  );

  // Inbound WhatsApp messages.
  app.post('/integrations/webhooks/whatsapp', async (request, reply) => {
    const messages = parseWhatsAppWebhook(request.body);
    if (messages.length > 0) deps.onInbound('whatsapp', messages);
    return reply.send({ received: messages.length });
  });
};
