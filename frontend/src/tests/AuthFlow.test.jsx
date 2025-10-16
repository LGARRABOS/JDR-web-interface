import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import useAuth, { AuthProvider } from '../hooks/useAuth.js';
import api from '../services/api.js';

describe('Flux d\'authentification', () => {
  test('register → login → logout', async () => {
    const getMock = vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('no session'));
    const postMock = vi.spyOn(api, 'post').mockImplementation((url, payload) => {
      if (url === '/auth/register') {
        return Promise.resolve({ data: { user: { id: 1, username: payload.username, role: payload.role } } });
      }
      if (url === '/auth/login') {
        return Promise.resolve({ data: { user: { id: 1, username: 'alice', role: 'player' } } });
      }
      if (url === '/auth/logout') {
        return Promise.resolve({ data: { message: 'ok' } });
      }
      return Promise.resolve({ data: {} });
    });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.register({ username: 'alice', email: 'alice@example.com', password: 'secret', role: 'player' });
    });
    expect(result.current.user).toMatchObject({ username: 'alice', role: 'player' });

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.login({ email: 'alice@example.com', password: 'secret' });
    });
    expect(result.current.user).toMatchObject({ username: 'alice' });

    getMock.mockRestore();
    postMock.mockRestore();
  });
});
