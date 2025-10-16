import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import DiceRoller from '../components/DiceRoller.jsx';

describe('DiceRoller', () => {
  test('calcule le résultat local et déclenche onRoll', async () => {
    const onRoll = vi.fn();
    render(<DiceRoller onRoll={onRoll} roller={() => 0.5} log={[]} />);
    const input = screen.getByPlaceholderText('/roll 1d20+3');
    fireEvent.change(input, { target: { value: '/roll 1d6+2' } });
    fireEvent.submit(input.closest('form'));

    expect(onRoll).toHaveBeenCalledWith('/roll 1d6+2', expect.objectContaining({ total: 6 }));
  });

  test('affiche une erreur pour une expression invalide', () => {
    render(<DiceRoller onRoll={vi.fn()} log={[]} />);
    const input = screen.getByPlaceholderText('/roll 1d20+3');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.submit(input.closest('form'));
    expect(screen.getByText(/Expression invalide/)).toBeInTheDocument();
  });
});
