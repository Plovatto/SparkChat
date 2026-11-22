import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomSummary } from '@lib/socket';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const socket = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { minLength?: number }) => lookup(ptApp, key).replace('{{minLength}}', String(options?.minLength ?? '')) }),
}));
vi.mock('@lib/i18n/app-i18n', () => ({ useOnLanguageChange: () => undefined, translate: (key: string) => key }));
vi.mock('@lib/socket', () => ({ useSocket: () => ({ socket }) }));
vi.mock('@hooks/useAutoDismiss', () => ({ useAutoDismiss: () => undefined }));
vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: (_target, property) => String(property) }) }),
  withAlpha: (color: string) => color,
}));
vi.mock('@features/profile-photos/components/Avatar', () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock('../styles/new-chat-modal.css', () => ({}));

const { NewChatModal } = await import('./NewChatModal');

const rooms = [
  {
    id: 'r1',
    type: 'private',
    name: '',
    participants: [
      { id: 'me', nickname: 'aana', avatar: 0 },
      { id: 'u2', nickname: 'abruno', avatar: 2 },
    ],
    lastMessage: { timestamp: '2026-11-20T10:00:00Z' },
  },
] as unknown as RoomSummary[];

describe('NewChatModal', () => {
  beforeEach(() => {
    socket.emit.mockReset();
  });

  it('renders the redesigned header, tabs and footnote', () => {
    render(<NewChatModal isOpen onClose={vi.fn()} rooms={rooms} currentUserId="me" />);
    expect(screen.getByRole('heading', { name: ptApp.newChat.title })).toBeTruthy();
    expect(screen.getByText(ptApp.newChat.subtitle)).toBeTruthy();
    expect(screen.getByRole('tab', { name: ptApp.newChat.private }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(ptApp.newChat.e2ee)).toBeTruthy();
  });

  it('fills the username from a recent chat and starts it without the @', () => {
    render(<NewChatModal isOpen onClose={vi.fn()} rooms={rooms} currentUserId="me" />);
    fireEvent.click(screen.getByRole('button', { name: 'abruno' }));
    expect(screen.getByLabelText<HTMLInputElement>(ptApp.newChat.friendUsername).value).toBe('abruno');
    fireEvent.change(screen.getByLabelText(ptApp.newChat.friendUsername), { target: { value: '@abruno' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.newChat.start }));
    expect(socket.emit).toHaveBeenCalledWith('room:create-private', { targetNickname: 'abruno' });
  });

  it('asks for a username before starting', () => {
    render(<NewChatModal isOpen onClose={vi.fn()} rooms={[]} currentUserId="me" />);
    expect(screen.queryByText(ptApp.newChat.recent)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: ptApp.newChat.start }));
    expect(screen.getByRole('alert').textContent).toContain(ptApp.newChat.enterUsername);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('creates a group from the group tab', () => {
    render(<NewChatModal isOpen onClose={vi.fn()} rooms={rooms} currentUserId="me" />);
    fireEvent.click(screen.getByRole('tab', { name: ptApp.common.group }));
    fireEvent.change(screen.getByLabelText(ptApp.newChat.createNew), { target: { value: 'Viagem' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.newChat.create }));
    expect(socket.emit).toHaveBeenCalledWith('room:create-group', { roomName: 'Viagem' });
  });

  it('rejects a too short group name', () => {
    render(<NewChatModal isOpen onClose={vi.fn()} rooms={rooms} currentUserId="me" />);
    fireEvent.click(screen.getByRole('tab', { name: ptApp.common.group }));
    fireEvent.change(screen.getByLabelText(ptApp.newChat.createNew), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.newChat.create }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
