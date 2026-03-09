import { render, screen } from '@testing-library/react';
import { PresenceBar } from './PresenceBar';

describe('PresenceBar', () => {
  it('renders connected users count', () => {
    render(
      <PresenceBar
        users={[
          { userId: 1, displayName: 'Alice', role: 'MJ' },
          { userId: 2, displayName: 'Bob', role: 'PLAYER' },
        ]}
      />
    );
    expect(screen.getByText('Connectés (2)')).toBeInTheDocument();
  });

  it('renders user names', () => {
    render(
      <PresenceBar
        users={[
          { userId: 1, displayName: 'Alice', role: 'MJ' },
          { userId: 2, displayName: 'Bob', role: 'PLAYER' },
        ]}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<PresenceBar users={[]} />);
    expect(screen.getByText('Connectés (0)')).toBeInTheDocument();
  });
});
