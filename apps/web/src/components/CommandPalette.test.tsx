import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommandPalette, type Command } from './CommandPalette.tsx';

const commands = (run = vi.fn()): Command[] => [
  { id: 'new', label: 'New chat', hint: 'Ctrl+N', run },
  { id: 'search', label: 'Search memory', run },
];

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette open={false} commands={commands()} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists and filters commands', () => {
    render(<CommandPalette open commands={commands()} onClose={() => {}} />);
    expect(screen.getByText('New chat')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Type a command…'), { target: { value: 'mem' } });
    expect(screen.queryByText('New chat')).not.toBeInTheDocument();
    expect(screen.getByText('Search memory')).toBeInTheDocument();
  });

  it('runs a command on click and closes', () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open commands={commands(run)} onClose={onClose} />);
    fireEvent.click(screen.getByText('Search memory'));
    expect(run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('runs the selected command on Enter', () => {
    const run = vi.fn();
    render(<CommandPalette open commands={commands(run)} onClose={() => {}} />);
    fireEvent.keyDown(screen.getByPlaceholderText('Type a command…'), { key: 'Enter' });
    expect(run).toHaveBeenCalled();
  });
});
