import { ScrollController } from './ScrollController';
import { World } from '../scene/World';
import styles from './StoryController.module.scss';

/**
 * Composición raíz de la experiencia: un mundo infinito de scroll (ver
 * `ScrollController`) con la escena 3D adentro. No hay "escenas" separadas
 * por tramos de scroll — el viaje es continuo — pero la estructura queda
 * lista para futuras variaciones del recorrido.
 */
export function StoryController() {
  return (
    <ScrollController>
      <div className={styles.stage}>
        <World />
      </div>
    </ScrollController>
  );
}
