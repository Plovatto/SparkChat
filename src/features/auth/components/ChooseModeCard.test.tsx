import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enApp from '../../../locales/en/app.json';
import ptApp from '../../../locales/pt/app.json';

type Tree = { [key: string]: string | Tree };

const language = vi.hoisted(() => ({ current: 'pt' }));
const reducedMotion = vi.hoisted(() => ({ current: false }));

function lookup(tree: Tree, key: string): string {
  const value = key.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
  return typeof value === 'string' ? value : key;
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => lookup(language.current === 'pt' ? ptApp : enApp, key) }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  useAppLanguage: () => ({ language: 'pt', changeLanguage: vi.fn() }),
}));

vi.mock('@features/motion', () => ({
  usePrefersReducedMotion: () => reducedMotion.current,
}));

vi.mock('../styles/welcome.css', () => ({}));
vi.mock('../styles/welcome-form.css', () => ({}));

const { ChooseModeCard } = await import('./ChooseModeCard');
const { AuthScene } = await import('./AuthScene');

interface RenderOptions {
  entranceReady?: boolean;
}

function renderCard({ entranceReady = true }: RenderOptions = {}) {
  const props = {
    darkMode: true,
    onToggleTheme: vi.fn(),
    onNewUser: vi.fn(),
    onExistingUser: vi.fn(),
  };
  const tree = (ready: boolean) => (
    <AuthScene sceneId="choose" kind="dark" entranceReady={ready}>
      <ChooseModeCard {...props} />
    </AuthScene>
  );
  const view = render(tree(entranceReady));
  return { ...props, ...view, showEntrance: () => view.rerender(tree(true)) };
}

function bubbleStates(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.welcome-slot')].map((slot) => slot.dataset.state ?? '');
}

describe('ChooseModeCard', () => {
  beforeEach(() => {
    language.current = 'pt';
    reducedMotion.current = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the brand, tagline, badge, actions and features from the locale', () => {
    renderCard();
    expect(screen.getByRole('heading', { level: 1, name: 'SparkChat' })).toBeTruthy();
    expect(screen.getByText(ptApp.auth.tagline)).toBeTruthy();
    expect(screen.getByText(ptApp.auth.welcome.e2ee)).toBeTruthy();
    expect(screen.getByRole('button', { name: ptApp.auth.createAccount })).toBeTruthy();
    expect(screen.getByRole('button', { name: ptApp.auth.haveAccount })).toBeTruthy();
    const features = screen.getByRole('list', { name: ptApp.auth.welcome.featuresLabel });
    expect(features.textContent).toContain(ptApp.auth.welcome.features.media);
    expect(features.textContent).toContain(ptApp.auth.welcome.features.calls);
    expect(features.textContent).toContain(ptApp.auth.welcome.features.themes);
  });

  it('wires the actions and the theme toggle', () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.createAccount }));
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.haveAccount }));
    fireEvent.click(screen.getByRole('button', { name: ptApp.auth.toLight }));
    expect(props.onNewUser).toHaveBeenCalledTimes(1);
    expect(props.onExistingUser).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('waits for the splash before playing the entrance', () => {
    const { container, showEntrance } = renderCard({ entranceReady: false });
    expect(container.querySelector('.welcome-card')).toBeNull();
    expect(container.querySelector('.welcome-field')).toBeNull();
    showEntrance();
    expect(container.querySelector('.welcome-card')).not.toBeNull();
  });

  it('hides the decorative chat field from assistive tech', () => {
    const { container } = renderCard();
    expect(container.querySelector('.welcome-field')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('brings the side messages in one by one, typing before incoming ones show', () => {
    const { container } = renderCard();
    expect(bubbleStates(container).every((state) => state === 'hidden')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(bubbleStates(container)[0]).toBe('typing');
    expect(container.textContent).not.toContain(ptApp.auth.welcome.bubbles.coffee['0']);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.textContent).toContain(ptApp.auth.welcome.bubbles.coffee['0']);
    expect(container.textContent).toContain(ptApp.auth.welcome.bubbles.onMyWay['0']);
    expect(bubbleStates(container).every((state) => state !== 'hidden')).toBe(true);
  });

  it('keeps the conversation alive after the entrance', () => {
    const { container } = renderCard();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    const reaction = () => container.querySelector('.welcome-reaction__count')?.textContent;
    const before = reaction();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(reaction()).not.toBe(before);
  });

  it('shows everything at once with reduced motion', () => {
    reducedMotion.current = true;
    const { container } = renderCard();
    expect(bubbleStates(container).every((state) => state !== 'hidden')).toBe(true);
    expect(container.textContent).toContain(ptApp.auth.welcome.bubbles.arrived['0']);
  });

  it('pauses the loops while the page is hidden', () => {
    const { container } = renderCard();
    const root = container.querySelector('.welcome-root');
    expect(root?.hasAttribute('data-paused')).toBe(false);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(root?.getAttribute('data-paused')).toBe('true');
    visibility.mockRestore();
  });
});
