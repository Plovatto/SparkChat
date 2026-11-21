export type InputModality = 'keyboard' | 'pointer';

let modality: InputModality = 'pointer';
let installed = false;

export function trackInputModality(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;
  document.addEventListener(
    'keydown',
    (event) => {
      if (!event.metaKey && !event.altKey && !event.ctrlKey) {
        modality = 'keyboard';
      }
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    () => {
      modality = 'pointer';
    },
    true,
  );
}

export function lastInputModality(): InputModality {
  return modality;
}
