import { describe, expect, it } from 'vitest';
import en from './en/app.json';
import pt from './pt/app.json';

describe('upload error translations', () => {
  it.each([
    ['pt', pt],
    ['en', en],
  ])('explains the new-account storage limit in %s', (_locale, messages) => {
    const upload = messages.errors.upload as Record<string, string | undefined>;

    expect(upload.newAccountQuotaExceeded?.trim()).toBeTruthy();
  });
});

describe('unreadable image translation', () => {
  it.each([
    ['pt', pt],
    ['en', en],
  ])('explains in %s that the picked image cannot be read', (_locale, messages) => {
    const upload = messages.chat.upload as Record<string, string | undefined>;

    expect(upload.imageUnreadable?.trim()).toBeTruthy();
  });
});
