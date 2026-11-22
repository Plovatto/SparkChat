export function isFramed(win: Window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

export function refuseFraming(win: Window): boolean {
  if (!isFramed(win)) {
    return false;
  }
  win.document.documentElement.hidden = true;
  try {
    if (win.top) {
      win.top.location.href = win.location.href;
    }
  } catch {
    return true;
  }
  return true;
}
