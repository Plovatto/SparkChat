export type PasswordMatchStatus = 'match' | 'mismatch' | null;

export function getPasswordMatchStatus(confirmValue: string, originalValue: string): PasswordMatchStatus {
  if (confirmValue.length === 0) {
    return null;
  }
  return confirmValue === originalValue ? 'match' : 'mismatch';
}
