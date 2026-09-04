export interface SessionAuth {
  userId: string;
  sessionToken: string;
}

export function buildAuthHeader(auth: SessionAuth): HeadersInit {
  return { Authorization: `Bearer ${auth.userId}:${auth.sessionToken}` };
}
