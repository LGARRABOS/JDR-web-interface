import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import MapPage from '../pages/MapPage.jsx';

const listeners = {};
const emitMock = vi.fn();

vi.mock('../hooks/useAuth.js', () => ({
  __esModule: true,
  default: () => ({ user: { id: 1, role: 'MJ', username: 'MJ' } })
}));

vi.mock('../hooks/useSocket.js', () => ({
  __esModule: true,
  default: () => ({
    on: (event, handler) => {
      listeners[event] = handler;
    },
    off: (event) => {
      delete listeners[event];
    },
    emit: emitMock
  })
}));

vi.mock('../services/api.js', () => ({
  CharacterService: {
    list: vi.fn().mockResolvedValue({
      data: {
        characters: [
          { id: 1, name: 'Elandra', hp: 12, mana: 8, image: '', userId: 1 }
        ]
      }
    }),
    update: vi.fn().mockResolvedValue({})
  },
  MapService: {
    upload: vi.fn()
  },
  DiceService: {
    roll: vi.fn().mockResolvedValue({ data: { result: { total: 10 } } })
  }
}));

describe('MapPage', () => {
  test('synchronise les déplacements via socket', async () => {
    render(<MapPage />);

    const characterCard = await screen.findByText('Elandra');
    expect(characterCard).toBeInTheDocument();

    listeners['token:move']?.({ id: 1, x: 35, y: 40 });

    await waitFor(() => {
      const token = screen.getByText('Ela');
      expect(token.style.left).toBe('35%');
    });
  });
});
