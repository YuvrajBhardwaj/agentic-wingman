import { Markdown } from './Markdown.tsx';

export const Message = ({
  role,
  text,
}: {
  role: 'user' | 'assistant';
  text: string;
}): JSX.Element => {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/15 px-4 py-2 text-sm text-slate-100">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-panel px-4 py-2 text-slate-100">
        {text.trim() === '' ? <span className="text-muted">…</span> : <Markdown content={text} />}
      </div>
    </div>
  );
};
