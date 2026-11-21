const DARK_SENDER_COLORS = ['#8fb3ff', '#ff9fc4', '#7fdcb4', '#ffc47f', '#c3a6ff', '#7fd3f2', '#f7a58d', '#b9e07a'];
const LIGHT_SENDER_COLORS = ['#2f52c4', '#b8306f', '#1d7f54', '#9c5a0c', '#6440c0', '#16708f', '#b0472a', '#4f7a0f'];

export function senderNameColor(senderId: string, kind: 'light' | 'dark' = 'dark'): string {
  const palette = kind === 'light' ? LIGHT_SENDER_COLORS : DARK_SENDER_COLORS;
  let hash = 0;
  for (let index = 0; index < senderId.length; index += 1) {
    hash = (hash * 31 + senderId.charCodeAt(index)) | 0;
  }
  return palette[Math.abs(hash) % palette.length] ?? palette[0]!;
}
