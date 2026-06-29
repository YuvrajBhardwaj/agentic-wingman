import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer.tsx';

describe('Composer', () => {
  it('submits on click and clears the input', () => {
    const onSubmit = vi.fn();
    render(<Composer isRunning={false} onSubmit={onSubmit} onStop={() => {}} />);
    const input = screen.getByPlaceholderText(/Ask Forgewright/i);
    fireEvent.change(input, { target: { value: 'do the thing' } });
    fireEvent.click(screen.getByText('Send'));
    expect(onSubmit).toHaveBeenCalledWith('do the thing');
  });

  it('submits on Enter but not Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(<Composer isRunning={false} onSubmit={onSubmit} onStop={() => {}} />);
    const input = screen.getByPlaceholderText(/Ask Forgewright/i);
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('shows a Stop button while running', () => {
    const onStop = vi.fn();
    render(<Composer isRunning onSubmit={() => {}} onStop={onStop} />);
    fireEvent.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalled();
  });
});
