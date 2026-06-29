import { Markdown } from './Markdown.tsx';

const Avatar = (): JSX.Element => (
  <div className="mt-0.5 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#cba6f7] text-xs font-bold text-surface shadow">
    F
  </div>
);

export const Message = ({
  role,
  text,
}: {
  role: 'user' | 'assistant';
  text: string;
}): JSX.Element => {
  if (role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-elevated px-4 py-2.5 text-[15px] leading-7 text-slate-100 shadow-sm">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-rise flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 text-xs font-medium text-muted">Forgewright</div>
        {text.trim() === '' ? (
          <span className="text-muted">…</span>
        ) : (
          <Markdown content={text} />
        )}
      </div>
    </div>
  );
};
