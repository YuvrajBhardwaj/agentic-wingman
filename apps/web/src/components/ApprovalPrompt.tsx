import type { TranscriptItem } from '../state/transcript.ts';

type ApprovalItem = Extract<TranscriptItem, { kind: 'approval' }>;

export const ApprovalPrompt = ({
  item,
  onDecide,
}: {
  item: ApprovalItem;
  onDecide: (approved: boolean) => void;
}): JSX.Element => {
  const pending = item.status === 'pending';
  return (
    <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
      <div className="flex items-center gap-2 text-sm text-warning">
        <span aria-hidden>⚠</span>
        <span className="font-medium">Approval required</span>
        {!pending ? (
          <span className="ml-auto text-xs uppercase tracking-wide text-muted">{item.status}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-200">{item.summary}</p>
      {item.target ? (
        <p className="mt-1 break-all font-mono text-xs text-muted">{item.target}</p>
      ) : null}
      {pending ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onDecide(true)}
            className="rounded-md bg-success/20 px-3 py-1 text-sm font-medium text-success hover:bg-success/30"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onDecide(false)}
            className="rounded-md bg-danger/20 px-3 py-1 text-sm font-medium text-danger hover:bg-danger/30"
          >
            Deny
          </button>
        </div>
      ) : null}
    </div>
  );
};
