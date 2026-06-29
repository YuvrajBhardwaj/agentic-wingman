import { useEffect, useState } from 'react';

import type { CurrentUser, ForgewrightClient, IntegrationInfo } from '../api/client.ts';

interface State {
  loading: boolean;
  providers: { google: boolean };
  me: CurrentUser;
  integrations: readonly IntegrationInfo[];
}

const Row = ({
  icon,
  name,
  detail,
  status,
  action,
}: {
  icon: string;
  name: string;
  detail: string;
  status: 'connected' | 'available' | 'unavailable';
  action?: JSX.Element;
}): JSX.Element => {
  const badge =
    status === 'connected'
      ? 'bg-success/15 text-success'
      : status === 'available'
        ? 'bg-accent/15 text-accent'
        : 'bg-elevated text-muted';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-100">{name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badge}`}>
            {status === 'connected' ? 'connected' : status === 'available' ? 'available' : 'not set up'}
          </span>
        </div>
        <p className="truncate text-xs text-muted">{detail}</p>
      </div>
      {action}
    </div>
  );
};

const ConnectButton = ({ href, label }: { href: string; label: string }): JSX.Element => (
  <a
    href={href}
    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-surface transition hover:bg-accent-strong"
  >
    {label}
  </a>
);

export const ConnectionsPanel = ({
  client,
  onClose,
}: {
  client: ForgewrightClient;
  onClose: () => void;
}): JSX.Element => {
  const [state, setState] = useState<State>({
    loading: true,
    providers: { google: false },
    me: { user: null, connections: { google: false } },
    integrations: [],
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      const [providers, me, integrations] = await Promise.all([
        client.authProviders(),
        client.me(),
        client.listIntegrations(),
      ]);
      if (active) setState({ loading: false, providers, me, integrations });
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const has = (id: string): boolean => state.integrations.some((i) => i.id === id);
  const googleConnected = state.me.connections.google;

  return (
    <div
      role="dialog"
      aria-label="Connections"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Connections</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
          {state.loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  Your accounts (OAuth)
                </h3>
                <Row
                  icon="🗓️"
                  name="Google — Gmail & Calendar"
                  detail={
                    googleConnected
                      ? `Connected as ${state.me.user?.email ?? 'your account'}`
                      : state.providers.google
                        ? 'Connect to let your assistant read mail and manage your calendar'
                        : 'Server not configured (set FORGE_GOOGLE_CLIENT_ID / SECRET)'
                  }
                  status={googleConnected ? 'connected' : state.providers.google ? 'available' : 'unavailable'}
                  {...(state.providers.google && !googleConnected
                    ? { action: <ConnectButton href="/auth/google/start" label="Connect" /> }
                    : {})}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  Messaging (configured on the server)
                </h3>
                <Row
                  icon="✈️"
                  name="Telegram"
                  detail={has('telegram') ? 'Bot connected — sends and receives messages' : 'Set FORGE_TELEGRAM_TOKEN on the server'}
                  status={has('telegram') ? 'connected' : 'unavailable'}
                />
                <Row
                  icon="🟢"
                  name="WhatsApp"
                  detail={has('whatsapp') ? 'Business API connected (inbound via webhook)' : 'Set FORGE_WHATSAPP_PHONE_ID / TOKEN on the server'}
                  status={has('whatsapp') ? 'connected' : 'unavailable'}
                />
                <Row
                  icon="💬"
                  name="Slack"
                  detail={has('slack') ? 'Connected' : 'Set FORGE_SLACK_TOKEN on the server'}
                  status={has('slack') ? 'connected' : 'unavailable'}
                />
              </section>

              <p className="text-xs text-muted">
                Google uses per-user OAuth — each user connects their own account. Telegram/WhatsApp/Slack are
                configured once on the server (bot token / Business API), not per-user sign-in.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
