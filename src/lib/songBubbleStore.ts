export type BubbleAnimal = 'pug' | 'cat';

/**
 * Estado mínimo compartido entre quien decide CUÁNDO aparece la burbuja
 * (`SongBubbleDirector`, fuera del Canvas) y quien la dibuja (`SongBubble`,
 * dentro de la escena 3D, anclada a cada animal). Es un store externo y no
 * un contexto de React porque los contextos no cruzan la frontera del
 * Canvas de R3F ni el portal de `<Html>`.
 */
let active: BubbleAnimal | null = null;
let nextTrackHandler: (() => void) | null = null;
const listeners = new Set<() => void>();
const pressListeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const songBubbleStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getActive: () => active,
  show(animal: BubbleAnimal) {
    active = animal;
    emit();
  },
  hide() {
    if (active === null) return;
    active = null;
    emit();
  },
  /** El usuario tocó la burbuja: cambia de canción y la oculta. */
  press() {
    nextTrackHandler?.();
    songBubbleStore.hide();
    pressListeners.forEach((fn) => fn());
  },
  onPress(fn: () => void) {
    pressListeners.add(fn);
    return () => {
      pressListeners.delete(fn);
    };
  },
  registerNextTrack(fn: () => void) {
    nextTrackHandler = fn;
    return () => {
      if (nextTrackHandler === fn) nextTrackHandler = null;
    };
  },
};
