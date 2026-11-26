const authenticatedSockets = new WeakSet<object>();

export function isSocketAuthenticated(socket: object): boolean {
  return authenticatedSockets.has(socket);
}

export function setSocketAuthenticated(socket: object, authenticated: boolean): void {
  if (authenticated) {
    authenticatedSockets.add(socket);
  } else {
    authenticatedSockets.delete(socket);
  }
}
