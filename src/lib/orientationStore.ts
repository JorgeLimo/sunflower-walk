/**
 * ¿Está el teléfono en horizontal? La experiencia está pensada solo para
 * vertical: mientras esto sea `true`, `OrientationGuard` tapa la pantalla y
 * `ScrollController` ignora cualquier scroll (el cambio de tamaño del
 * viewport al girar mueve `scrollY` sin que el usuario haya avanzado nada).
 * Es un store externo porque el scroll vive fuera de React.
 */
let locked = false;
const listeners = new Set<() => void>();

export const orientationStore = {
  isLocked: () => locked,
  set(next: boolean) {
    if (locked === next) return;
    locked = next;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
