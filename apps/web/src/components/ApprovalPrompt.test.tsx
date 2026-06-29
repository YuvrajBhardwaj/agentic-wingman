import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TranscriptItem } from '../state/transcript.ts';

import { ApprovalPrompt } from './ApprovalPrompt.tsx';

type ApprovalItem = Extract<TranscriptItem, { kind: 'approval' }>;

const pending: ApprovalItem = {
  id: 'i1',
  kind: 'approval',
  approvalId: 'a1',
  summary: 'Write file src/index.ts',
  target: 'src/index.ts',
  status: 'pending',
};

describe('ApprovalPrompt', () => {
  it('shows the summary and target', () => {
    render(<ApprovalPrompt item={pending} onDecide={() => {}} />);
    expect(screen.getByText('Write file src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
  });

  it('fires the decision callback', () => {
    const onDecide = vi.fn();
    render(<ApprovalPrompt item={pending} onDecide={onDecide} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onDecide).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText('Deny'));
    expect(onDecide).toHaveBeenCalledWith(false);
  });

  it('hides buttons once resolved', () => {
    render(<ApprovalPrompt item={{ ...pending, status: 'approved' }} onDecide={() => {}} />);
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
  });
});
