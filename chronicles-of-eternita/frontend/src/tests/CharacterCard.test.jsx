import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import CharacterCard from '../components/CharacterCard.jsx';

describe('CharacterCard', () => {
  const character = { id: 1, name: 'Elandra', hp: 12, mana: 8, image: '' };

  test('affiche les informations du personnage', () => {
    render(<CharacterCard character={character} />);
    expect(screen.getByText('Elandra')).toBeInTheDocument();
    expect(screen.getByText(/PV : 12/)).toBeInTheDocument();
  });

  test('permet la modification des valeurs', async () => {
    const onUpdate = vi.fn();
    render(<CharacterCard character={character} isEditable onUpdate={onUpdate} />);
    const hpInput = screen.getByLabelText('PV');
    fireEvent.change(hpInput, { target: { value: '18' } });
    fireEvent.blur(hpInput);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ hp: 18 }));
  });
});
