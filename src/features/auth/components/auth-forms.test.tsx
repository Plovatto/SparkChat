import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const nickname = vi.hoisted(() => ({ status: 'idle' }));
const loginFlows = vi.hoisted(() => ({ loginWithPassword: vi.fn(), loginWithRecoveryFile: vi.fn() }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { minLength?: number }) => lookup(ptApp, key).replace('{{minLength}}', String(options?.minLength ?? '')) }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  useAppLanguage: () => ({ language: 'pt', changeLanguage: vi.fn() }),
  useOnLanguageChange: () => undefined,
  translate: (key: string) => key,
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: (_target, property) => String(property) }) }),
  withAlpha: (color: string) => color,
}));

vi.mock('@hooks/useAutoDismiss', () => ({ useAutoDismiss: () => undefined }));
vi.mock('../hooks/useNicknameAvailability', () => ({ useNicknameAvailability: () => nickname.status }));
vi.mock('../lib/login-flows', () => loginFlows);
vi.mock('@lib/e2ee', () => ({ prepareRegistrationCredentials: vi.fn(() => Promise.resolve({ token: 'creds' })) }));
vi.mock('@features/profile-photos/hooks/usePhotoDraft', () => ({
  usePhotoDraft: () => ({ photoUrl: null, isSelected: false, pendingBlob: null, pick: vi.fn(), selectPhoto: vi.fn(), selectPreset: vi.fn(), remove: vi.fn() }),
}));
vi.mock('@features/profile-photos/hooks/usePhotoPicker', () => ({
  usePhotoPicker: () => ({ open: vi.fn(), isPreparing: false, error: null, element: null }),
}));
vi.mock('@features/profile-photos/components/profile-photos.css', () => ({}));

const { LoginForm } = await import('./LoginForm');
const { CreateAccountForm } = await import('./CreateAccountForm');

const theme = new Proxy({}, { get: (_target, property) => String(property) }) as Parameters<typeof LoginForm>[0]['theme'];

describe('LoginForm', () => {
  beforeEach(() => {
    loginFlows.loginWithPassword.mockReset();
  });

  function renderLogin() {
    const props = { darkMode: true, theme, onToggleTheme: vi.fn(), onBack: vi.fn(), onSubmit: vi.fn() };
    render(<LoginForm {...props} />);
    return props;
  }

  it('labels the fields and shows the welcome back hero', () => {
    renderLogin();
    expect(screen.getByRole('heading', { level: 1, name: ptApp.auth.login.title })).toBeTruthy();
    expect(screen.getByLabelText(ptApp.auth.login.username)).toBeTruthy();
    expect(screen.getByLabelText(ptApp.auth.login.password)).toBeTruthy();
    expect(screen.getByText(ptApp.auth.welcome.or)).toBeTruthy();
  });

  it('asks for both fields before signing in', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.login.submit }));
    expect(screen.getByRole('alert').textContent).toContain(ptApp.auth.login.fillFields);
    expect(loginFlows.loginWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the typed credentials', async () => {
    const user = { id: 'u1' };
    loginFlows.loginWithPassword.mockResolvedValue({ user, credential: undefined });
    const props = renderLogin();
    fireEvent.change(screen.getByLabelText(ptApp.auth.login.username), { target: { value: ' pandora ' } });
    fireEvent.change(screen.getByLabelText(ptApp.auth.login.password), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.login.submit }));
    await act(() => Promise.resolve());
    expect(loginFlows.loginWithPassword).toHaveBeenCalledWith('pandora', 'secret');
    expect(props.onSubmit).toHaveBeenCalledWith(user, undefined);
  });

  it('switches to the recovery file and back', () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.login.switchToKeyfile }));
    expect(screen.getByText(ptApp.auth.login.withKeyfile)).toBeTruthy();
    expect(screen.getByLabelText(ptApp.auth.login.keyfile)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.login.switchToPassword }));
    expect(screen.getByLabelText(ptApp.auth.login.username)).toBeTruthy();
  });

  it('goes back and toggles the theme from the hero', () => {
    const props = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: ptApp.common.back }));
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.toLight }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('reveals the password on demand', () => {
    renderLogin();
    const input = screen.getByLabelText<HTMLInputElement>(ptApp.auth.login.password);
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.showPassword }));
    expect(input.type).toBe('text');
  });
});

describe('CreateAccountForm', () => {
  beforeEach(() => {
    nickname.status = 'idle';
  });

  function renderRegister() {
    const props = { darkMode: true, theme, onToggleTheme: vi.fn(), onBack: vi.fn(), onSubmit: vi.fn() };
    render(<CreateAccountForm {...props} />);
    return props;
  }

  it('renders the hero, avatar grid and fields', () => {
    renderRegister();
    expect(screen.getByRole('heading', { level: 1, name: ptApp.auth.register.title })).toBeTruthy();
    expect(screen.getByRole('group', { name: ptApp.auth.register.avatar })).toBeTruthy();
    expect(screen.getByLabelText(ptApp.auth.register.username)).toBeTruthy();
    expect(screen.getByLabelText(ptApp.auth.register.password)).toBeTruthy();
    expect(screen.queryByLabelText(ptApp.auth.register.confirmPassword)).toBeNull();
  });

  it('marks the chosen avatar as pressed', () => {
    renderRegister();
    const options = screen.getAllByRole('button', { pressed: false }).filter((button) => button.classList.contains('sc-avatar-picker__option'));
    const target = options[1]!;
    fireEvent.click(target);
    expect(target.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { pressed: true }).filter((button) => button.classList.contains('sc-avatar-picker__option'))).toHaveLength(1);
  });

  it('strips symbols from the username and counts characters', () => {
    renderRegister();
    const input = screen.getByLabelText<HTMLInputElement>(ptApp.auth.register.username);
    fireEvent.change(input, { target: { value: 'pan dora!' } });
    expect(input.value).toBe('pandora');
    expect(screen.getByText('7/20')).toBeTruthy();
  });

  it('reveals the confirmation field and flags mismatches', () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.password), { target: { value: 'abc' } });
    const confirm = screen.getByLabelText(ptApp.auth.register.confirmPassword);
    fireEvent.change(confirm, { target: { value: 'abd' } });
    expect(screen.getByText(ptApp.auth.passwordsMismatch)).toBeTruthy();
    fireEvent.change(confirm, { target: { value: 'abc' } });
    expect(screen.getByText(ptApp.auth.passwordsMatch)).toBeTruthy();
  });

  it('shows the availability status of the username', () => {
    nickname.status = 'taken';
    renderRegister();
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.username), { target: { value: 'pandora' } });
    expect(screen.getByText(ptApp.auth.register.taken)).toBeTruthy();
  });

  it('submits a valid registration', async () => {
    nickname.status = 'available';
    const props = renderRegister();
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.username), { target: { value: 'pandora' } });
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.password), { target: { value: 'supersecret12' } });
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.confirmPassword), { target: { value: 'supersecret12' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.register.submit }));
    await act(() => Promise.resolve());
    expect(props.onSubmit).toHaveBeenCalledWith({ nickname: 'pandora', avatar: 0, credentials: { token: 'creds' }, photo: undefined });
  });

  it('refuses a short password', () => {
    nickname.status = 'available';
    const props = renderRegister();
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.username), { target: { value: 'pandora' } });
    fireEvent.change(screen.getByLabelText(ptApp.auth.register.password), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.register.submit }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
