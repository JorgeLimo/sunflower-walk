/** Paleta cálida y nostálgica compartida entre materiales 3D y overlays HTML. */
export const colors = {
  skyTop: '#8fb8d9',
  skyHorizon: '#ffd9a0',
  fogColor: '#f3d9ad',

  sunCore: '#fff2c2',
  sunGlow: '#ffb15e',

  groundNear: '#7fae57',
  groundFar: '#a9c07c',
  mountainFar: '#b9c9a8',

  roadFill: '#c9a876',
  roadEdge: '#b6905c',

  stem: '#5f8f47',
  stemDark: '#4d7539',
  petal: '#ffce4a',
  petalShadow: '#f2a93c',
  flowerCenter: '#6b4a2b',
  flowerCenterDark: '#3a2413',

  // Tulipanes: acento secundario, nunca protagonista — de ahí el rosa
  // deliberadamente lavado (no un rosa saturado que compita con el amarillo
  // del girasol) y el blanco con un dejo cálido (blanco puro se ve plano
  // bajo la luz cálida del sol, mismo motivo que el pétalo del lirio).
  tulipPink: '#f3cdd9',
  tulipPinkShadow: '#e3aebe',
  tulipWhite: '#faf4e6',
  tulipWhiteShadow: '#e8dfc9',

  personSkin: '#f3caa1',
  personHair: '#4a3226',
  personOutfit: '#d97b5f',
  personOutfitShadow: '#c1614a',
  personScarf: '#f2efe4',
  personBlush: '#f0a898',

  pugBody: '#d9b98a',
  pugBodyShadow: '#c2a274',
  pugDark: '#3a2e28',

  // Gato negro: un carbón cálido en vez de negro puro, porque el negro
  // absoluto se aplana (no devuelve nada del sol ni de la luz de luna) y la
  // silueta pierde todo el volumen.
  catFur: '#2f2b28',
  catFurShadow: '#201d1b',
  catFace: '#3c3733',
  catNose: '#d79a96',
  catEye: '#c9d94f',

  ink: '#4a3f35',
  paper: '#fbf3e3',
} as const;
