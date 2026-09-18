/**
 * Factor de noche compartido y mutable (no reactivo): `Greeters.tsx` lo
 * actualiza UNA sola vez por cuadro (ya recorre el ciclo día/noche para
 * mover los tiles) y cada `GreeterFigure` lo lee desde su propio useFrame
 * para encender el brillo cálido de su cartel — evita que cada personita
 * (hasta 18 montadas a la vez) recalcule `getSkyState` por su cuenta.
 */
export const greeterNightState = { nightFactor: 0 };
