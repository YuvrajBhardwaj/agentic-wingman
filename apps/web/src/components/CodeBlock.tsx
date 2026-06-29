export const CodeBlock = ({ code, label }: { code: string; label?: string }): JSX.Element => (
  <div className="overflow-hidden rounded-md border border-border">
    {label ? (
      <div className="border-b border-border bg-elevated px-3 py-1 font-mono text-xs text-muted">
        {label}
      </div>
    ) : null}
    <pre className="max-h-80 overflow-auto bg-elevated p-3 text-xs leading-relaxed">
      <code className="font-mono text-slate-200">{code}</code>
    </pre>
  </div>
);
