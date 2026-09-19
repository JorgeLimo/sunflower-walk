/**
 * Marca (fuera de React y fuera del Canvas, donde los contextos no llegan)
 * el instante en que el usuario presionó "Entrar": los eventos ambientales
 * con cuenta regresiva desde el inicio del recorrido (p. ej. el avión) la
 * leen para saber cuándo empezar a contar.
 */
export const experience: { started: boolean } = { started: false };

export function markExperienceStarted() {
  experience.started = true;
}
