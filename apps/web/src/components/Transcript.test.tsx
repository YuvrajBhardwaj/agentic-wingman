import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TranscriptItem } from '../state/transcript.ts';

import { Transcript } from './Transcript.tsx';

const items: TranscriptItem[] = [
  { id: '1', kind: 'user', text: 'change the config' },
  { id: '2', kind: 'assistant', text: 'Here is the **plan**.' },
  {
    id: '3',
    kind: 'tool',
    toolId: 't1',
    name: 'write_file',
    input: { path: 'cfg.ts', content: 'export const x = 1;' },
    status: 'done',
    output: { created: true },
  },
  { id: '4', kind: 'approval', approvalId: 'a1', summary: 'Run tests', status: 'pending' },
];

describe('Transcript', () => {
  it('renders an empty state with no items', () => {
    render(<Transcript items={[]} onApprove={() => {}} />);
    expect(screen.getByText('Forgewright')).toBeInTheDocument();
  });

  it('renders each item kind', () => {
    render(<Transcript items={items} onApprove={() => {}} />);
    expect(screen.getByText('change the config')).toBeInTheDocument();
    expect(screen.getByText('plan')).toBeInTheDocument(); // markdown bold
    expect(screen.getByText('write_file')).toBeInTheDocument();
    expect(screen.getByText('Run tests')).toBeInTheDocument();
  });

  it('surfaces approval decisions with the approval id', () => {
    const onApprove = vi.fn();
    render(<Transcript items={items} onApprove={onApprove} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('a1', true);
  });
});
