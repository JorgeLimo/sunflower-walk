import { useEffect } from 'react';
import { useAudioApi } from './AudioContext';
import { songBubbleStore, type BubbleAnimal } from '../../lib/songBubbleStore';

const FIRST_DELAY_S: [number, number] = [18, 24];
// Cada aparición ocurre ~30 s después de la anterior (o después de haber
// tocado la burbuja), con un poco de variación para que no caiga siempre en
// el mismo punto exacto del recorrido.
const INTERVAL_S: [number, number] = [26, 34];
const VISIBLE_MS = 9000;

const between = ([min, max]: [number, number]) => (min + Math.random() * (max - min)) * 1000;

/**
 * Decide cuándo asoma la burbuja "¿Cambiamos de canción?" y junto a cuál de
 * los dos animales: aproximadamente cada 30 segundos y alternando — una vez
 * el Pug, la siguiente el gato, y así — nunca los dos a la vez y nunca antes
 * de entrar. No dibuja nada, solo mueve `songBubbleStore`. Si hay una sola
 * canción disponible no tiene sentido ofrecer cambiarla, así que no aparece.
 */
export function SongBubbleDirector({ enabled }: { enabled: boolean }) {
  const { trackCount } = useAudioApi();
  const canOffer = enabled && trackCount > 1;

  useEffect(() => {
    if (!canOffer) return;

    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    // El primero es al azar; de ahí en más se alternan.
    let next: BubbleAnimal = Math.random() < 0.5 ? 'pug' : 'cat';

    const schedule = (range: [number, number]) => {
      clearTimeout(showTimer);
      showTimer = setTimeout(show, between(range));
    };
    const show = () => {
      if (document.hidden) {
        schedule([5, 10]);
        return;
      }
      songBubbleStore.show(next);
      next = next === 'pug' ? 'cat' : 'pug';
      hideTimer = setTimeout(() => songBubbleStore.hide(), VISIBLE_MS);
      schedule(INTERVAL_S);
    };

    const offPress = songBubbleStore.onPress(() => {
      clearTimeout(hideTimer);
      schedule(INTERVAL_S);
    });

    schedule(FIRST_DELAY_S);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      offPress();
      songBubbleStore.hide();
    };
  }, [canOffer]);

  return null;
}
