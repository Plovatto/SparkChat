import { afterEach, describe, expect, it } from 'vitest';
import { appI18n } from '@lib/i18n/app-i18n';
import { ApiError, toApiError, translateError, translateErrorPayload } from './api-error';

afterEach(async () => {
  await appI18n.changeLanguage('pt');
});

describe('translateErrorPayload', () => {
  it('translates a known code into the current language', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'user.nicknameTaken', message: 'Esse nickname já está em uso.' }, 'errors.generic')).toBe(
      'That username is already taken.',
    );
  });

  it('fills in the params sent by the server', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'user.passwordTooShort', params: { minLength: 6 } }, 'errors.generic')).toBe(
      'Your password must be at least 6 characters long.',
    );
  });

  it('explains the password policy and the group rotation errors in both languages', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'user.passwordLengthRequired' }, 'errors.generic')).toBe('Update the app to set a password.');
    expect(translateErrorPayload({ code: 'e2e.rotationNotAuthorized' }, 'errors.generic')).toBe(
      'Only group admins can renew the group key right now. Trying again shortly.',
    );
    await appI18n.changeLanguage('pt');
    expect(translateErrorPayload({ code: 'user.passwordTooShort', params: { minLength: 12 } }, 'errors.generic')).toBe('A senha deve ter pelo menos 12 caracteres.');
    expect(translateErrorPayload({ code: 'user.passwordLengthRequired' }, 'errors.generic')).toBe('Atualize o aplicativo para definir uma senha.');
  });

  it('translates the private conversation creation limit in both languages', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'rateLimit.privateRoomCreate', message: 'Muitas conversas novas em pouco tempo.' }, 'errors.generic')).toBe(
      'You started too many new conversations in a short time. Try again later.',
    );
    await appI18n.changeLanguage('pt');
    expect(translateErrorPayload({ code: 'rateLimit.privateRoomCreate' }, 'errors.generic')).toBe(
      'Muitas conversas novas em pouco tempo. Tente novamente mais tarde.',
    );
  });

  it('explains the per-account sign-in delay in both languages', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'rateLimit.accountAttempts', message: 'server text' }, 'errors.generic')).toBe(
      'Too many sign-in attempts on this account. Wait a few seconds and try again.',
    );
    await appI18n.changeLanguage('pt');
    expect(translateErrorPayload({ code: 'rateLimit.accountAttempts', message: 'server text' }, 'errors.generic')).toBe(
      'Muitas tentativas de login nesta conta. Aguarde alguns segundos e tente novamente.',
    );
  });

  it('picks the wording for the upload kind', () => {
    expect(translateErrorPayload({ code: 'upload.tooLarge', params: { kind: 'image', maxSize: '5MB' } }, 'errors.generic')).toBe(
      'A imagem excede o tamanho máximo permitido de 5MB.',
    );
    expect(translateErrorPayload({ code: 'upload.tooLarge', params: { kind: 'audio', maxSize: '8MB' } }, 'errors.generic')).toBe(
      'O áudio excede o tamanho máximo permitido de 8MB.',
    );
  });

  it('shows the server message for a code the app does not know yet', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({ code: 'room.somethingNew', message: 'Algo novo.' }, 'errors.generic')).toBe('Algo novo.');
  });

  it('falls back to the given key when nothing usable came back', async () => {
    await appI18n.changeLanguage('en');
    expect(translateErrorPayload({}, 'errors.connection')).toBe("Couldn't reach the server. Please try again!");
  });
});

describe('translateError', () => {
  it('reads code and params from an ApiError', async () => {
    await appI18n.changeLanguage('en');
    const error = toApiError({ message: 'Sala não encontrada.', code: 'room.notFound' }, 'errors.generic');
    expect(error).toBeInstanceOf(ApiError);
    expect(translateError(error, 'errors.generic')).toBe('Conversation not found.');
  });

  it('uses the fallback for network failures', () => {
    expect(translateError(new TypeError('Failed to fetch'), 'errors.connection')).toBe('Erro ao conectar com o servidor. Tente novamente!');
  });

  it('ignores malformed payloads and uses its own fallback', async () => {
    const error = toApiError({ code: 42, params: 'x' }, 'auth.login.failed');
    expect(error.code).toBeUndefined();
    await appI18n.changeLanguage('en');
    expect(translateError(error, 'errors.connection')).toBe("Couldn't sign in. Please try again!");
  });
});
