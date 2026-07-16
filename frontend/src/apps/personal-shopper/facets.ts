/**
 * Facetas del catálogo público del shopper — rail de chips tipo Uber Eats.
 * Se derivan de lo que ya existe (título/descripción/categoría/oferta), sin IA ni
 * migración. Espejo de apps/importaciones/facets.ts, tipado a PublicShopperItem.
 */
import type { PublicShopperItem } from '@/services/shopper_catalog.service';

export interface Facet {
  id: string;
  label: string;
  emoji: string;
}

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

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const RE_MUJER  = /\b(womens?|woman|mujer(es)?|femenin[ao]s?|ladies|lady|dama|damas)\b/;
const RE_HOMBRE = /\b(mens?|hombres?|masculin[ao]s?|caballeros?)\b/;
const RE_NINOS  = /\b(kids?|toddlers?|bab(y|ies)|infant|children|child|ninos?|ninas?|bebes?|boys?|girls?|juguetes?|toys?)\b/;

const RE_USO: Record<string, RegExp> = {
  medicina: /\b(medicin[ao]s?|medicine|salud|health|vitaminas?|vitamins?|suplementos?|supplements?|gummies|gomitas|capsulas?|capsules?|omega|creatin[ae]|colageno|collagen|melatonina?|probiotic[oa]?s?)\b/,
  belleza: /\b(belleza|beauty|maquillaje|makeup|skincare|skin care|serum|crema|cream|labial|lipstick|mascara|perfumes?|fragrance|cabello|hair|shampoo|nail)\b/,
  tecnologia: /\b(tecnologia|tech|electronic[ao]?s?|audifonos?|headphones?|earbuds?|bluetooth|cargadores?|charger|cables?|usb|celular(es)?|phones?|smart ?watch(es)?|laptop|ipad|camaras?|camera|mouse|teclados?|keyboard|speakers?|drone|gaming)\b/,
  hogar: /\b(hogar|home|casa|decoracion|decor|lamparas?|lamps?|organizador(es)?|organizer|almohadas?|pillows?|sabanas?|cortinas?|curtains?|muebles?|limpieza)\b/,
  cocina: /\b(cocina|kitchen|sarten(es)?|skillet|ollas?|cafeteras?|coffee|licuadora|blender|air fryer|freidora|cuchillos?|knife|knives|tazas?|mugs?|utensilios?)\b/,
  ropa: /\b(ropa|clothing|camisas?|shirts?|pantalones?|pants|vestidos?|dress(es)?|zapatos?|shoes?|sneakers?|chaquetas?|jackets?|sueter(es)?|sweaters?|calcetines?|socks?)\b/,
  deportes: /\b(deportes?|sports?|fitness|gym|gimnasio|yoga|running|correr|pesas|mancuernas?|dumbbells?|bicicletas?|bikes?|soccer|futbol|basketball)\b/,
  mascotas: /\b(mascotas?|pets?|perros?|dogs?|gatos?|cats?|puppy|kitten|veterinari[ao])\b/,
};

export function deriveFacets(item: PublicShopperItem): string[] {
  const found: string[] = [];
  if (item.is_offer) found.push('oferta');

  const who = norm(`${item.title} ${item.category ?? ''}`);
  const paraMujer = RE_MUJER.test(who);
  const paraHombre = RE_HOMBRE.test(who);
  if (RE_NINOS.test(who)) found.push('ninos');
  else if (paraMujer && !paraHombre) found.push('mujer');
  else if (paraHombre && !paraMujer) found.push('hombre');

  const what = norm(`${item.title} ${item.description ?? ''} ${item.category ?? ''}`);
  for (const [id, re] of Object.entries(RE_USO)) {
    if (re.test(what)) found.push(id);
  }
  return found;
}

export function availableFacets(items: PublicShopperItem[]): Array<Facet & { count: number }> {
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
