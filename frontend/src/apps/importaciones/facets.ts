/**
 * Facetas del catálogo público — el rail de chips tipo Uber Eats.
 *
 * El vendedor no va a etiquetar 200 productos a mano, así que las facetas se
 * derivan de lo que ya existe: el `category` que él escribió (texto libre) y el
 * título/descripción que trajo el scraper de Amazon. Cero migración, cero IA.
 *
 * Dos ejes:
 *  - Audiencia (mujer / hombre / niños): sólo sobre título + categoría. La
 *    descripción mete demasiado ruido ("ideal para regalar a mamá").
 *  - Uso (medicina, tecnología, belleza…): sobre título + descripción + categoría.
 *    El `category` del vendedor cae aquí solo: "Tecnología" matchea `tecnologia`.
 *    Eso además normaliza las categorías inconsistentes que escribe a mano.
 *
 * Si mañana la mala clasificación se vuelve una queja real, `deriveFacets` se
 * promueve a una columna `facets` poblada al publicar y editable por el vendedor.
 */
import type { PublicImportCatalogItem } from '@/services/import_catalog.service';

export interface Facet {
  id: string;
  label: string;
  emoji: string;
}

// El orden acá es el orden del rail. Ofertas primero (es lo que más convierte),
// luego audiencia, luego uso — de lo más buscado a lo más nicho.
export const FACETS: Facet[] = [
  { id: 'oferta',     label: 'Ofertas',    emoji: '🔥' },
  { id: 'mujer',      label: 'Mujer',      emoji: '👩' },
  { id: 'hombre',     label: 'Hombre',     emoji: '👨' },
  { id: 'ninos',      label: 'Niños',      emoji: '🧸' },
  { id: 'medicina',   label: 'Medicina',   emoji: '💊' },
  { id: 'belleza',    label: 'Belleza',    emoji: '💄' },
  { id: 'tecnologia', label: 'Tecnología', emoji: '📱' },
  { id: 'hogar',      label: 'Hogar',      emoji: '🏠' },
  { id: 'cocina',     label: 'Cocina',     emoji: '🍳' },
  { id: 'ropa',       label: 'Ropa',       emoji: '👕' },
  { id: 'deportes',   label: 'Deportes',   emoji: '🏋️' },
  { id: 'mascotas',   label: 'Mascotas',   emoji: '🐶' },
];

/** minúsculas y sin tildes — los patrones se escriben todos sin acentos. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Los `\b` son load-bearing: sin ellos "men" matchea dentro de "women" y todo
// producto de mujer termina también en hombre.
// `man` suelto queda fuera a propósito: "Iron Man", "Pac-Man" y "Man Cave" no son
// productos para hombre. "men's"/"hombre"/"caballero" cargan la señal igual.
const RE_MUJER  = /\b(womens?|woman|mujer(es)?|femenin[ao]s?|ladies|lady|dama|damas)\b/;
const RE_HOMBRE = /\b(mens?|hombres?|masculin[ao]s?|caballeros?)\b/;
const RE_NINOS  = /\b(kids?|toddlers?|bab(y|ies)|infant|children|child|ninos?|ninas?|bebes?|boys?|girls?|juguetes?|toys?|action figure|figura de accion)\b/;

const RE_USO: Record<string, RegExp> = {
  // Este catálogo vive de suplementos, así que el vocabulario va ancho: gomitas,
  // cápsulas, omega, creatina y demás son "medicina" para quien busca.
  medicina: /\b(medicin[ao]s?|medicine|salud|health|vitaminas?|vitamins?|multivitamins?|suplementos?|supplements?|gummies|gomitas|capsulas?|capsules?|pastillas?|termometros?|thermometer|farmacia|omega|fish oil|creatin[ae]|ashwagandha|probiotic[oa]?s?|colageno|collagen|melatonina?|magnesi[ou]m?|biotina?|amino ?acids?|aminoacidos?|electrolit|glucosa|presion arterial|primeros auxilios|first aid|nebulizador|oximetro)\b/,
  belleza: /\b(belleza|beauty|maquillaje|makeup|skincare|skin care|serum|crema|cream|labial|lipstick|blush|tint|mascara|perfumes?|fragrance|cabello|hair|shampoo|esmalte|nail|manicure|pestanas?|eyelash(es)?|lash(es)?|cejas?|whitening|teeth|dientes)\b/,
  // `tablet` queda fuera a propósito: en un catálogo de suplementos matchea las
  // "tablets" de las vitaminas y manda medio catálogo a Tecnología.
  tecnologia: /\b(tecnologia|tech|electronic[ao]?s?|audifonos?|headphones?|earbuds?|bluetooth|cargadores?|charger|cables?|usb|celular(es)?|phones?|smart ?watch(es)?|fitbit|tracker|laptop|ipad|camaras?|camera|mouse|teclados?|keyboard|altavoz|speakers?|drone|gaming|gamer|consolas?|consoles?|arcade)\b/,
  hogar: /\b(hogar|home|casa|decoracion|decor|lamparas?|lamps?|organizador(es)?|organizer|almohadas?|pillows?|sabanas?|cortinas?|curtains?|muebles?|limpieza|cleaning|aspiradora)\b/,
  cocina: /\b(cocina|kitchen|sarten(es)?|skillet|ollas?|cafeteras?|coffee|licuadora|blender|air fryer|freidora|cuchillos?|knife|knives|tazas?|mugs?|vasos?|utensilios?)\b/,
  ropa: /\b(ropa|clothing|camisas?|shirts?|pantalones?|pants|vestidos?|dress(es)?|zapatos?|shoes?|sneakers?|chaquetas?|jackets?|sueter(es)?|sweaters?|calcetines?|socks?|sandalias?)\b/,
  deportes: /\b(deportes?|sports?|fitness|gym|gimnasio|yoga|pilates|running|correr|pesas|mancuernas?|dumbbells?|resistance bands?|bicicletas?|bikes?|entrenamiento|soccer|futbol|balon(es)?|basketball|baloncesto)\b/,
  mascotas: /\b(mascotas?|pets?|perros?|dogs?|gatos?|cats?|puppy|kitten|veterinari[ao])\b/,
};

/**
 * Facetas de un ítem. Devuelve `[]` si no matcheó nada — un ítem sin facetas
 * simplemente no aparece bajo ningún chip, pero sí bajo "Todo".
 */
export function deriveFacets(item: PublicImportCatalogItem): string[] {
  const found: string[] = [];

  if (item.is_offer) found.push('oferta');

  // Audiencia: sólo título + categoría; la descripción mete demasiado ruido.
  // Si el título nombra a los dos géneros ("for Men and Women", clásico de los
  // suplementos) el producto es unisex: no lleva faceta de audiencia. Quedarse
  // con uno lo escondería de la mitad de la gente que lo está buscando.
  const who = norm(`${item.title} ${item.category ?? ''}`);
  const paraMujer = RE_MUJER.test(who);
  const paraHombre = RE_HOMBRE.test(who);
  if (RE_NINOS.test(who)) found.push('ninos');
  else if (paraMujer && !paraHombre) found.push('mujer');
  else if (paraHombre && !paraMujer) found.push('hombre');

  // Uso: acá sí entra la descripción, y un ítem puede caer en varios.
  const what = norm(`${item.title} ${item.description ?? ''} ${item.category ?? ''}`);
  for (const [id, re] of Object.entries(RE_USO)) {
    if (re.test(what)) found.push(id);
  }

  return found;
}

/**
 * Facetas que de verdad tienen productos, en el orden de `FACETS`, con su conteo.
 * Las de 0 no se devuelven: un chip "Medicina (0)" delata la taxonomía y se ve roto.
 */
export function availableFacets(
  items: PublicImportCatalogItem[],
): Array<Facet & { count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const f of deriveFacets(item)) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  return FACETS
    .map(f => ({ ...f, count: counts.get(f.id) ?? 0 }))
    .filter(f => f.count > 0);
}
