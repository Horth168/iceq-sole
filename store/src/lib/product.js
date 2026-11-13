// Colour/photo helpers shared by the product page, quick view and purchase panel.
// Rule: a colourway only ever shows its own photos (or colour-neutral ones). If there are none,
// the gallery shows the "photo coming soon" placeholder instead of another colour's photos.

export function productColors(p) {
  if (!p) return []
  const withPhoto = new Set(p.images.map((i) => i.color_id).filter(Boolean))
  const m = new Map()
  p.variants.forEach((v) => {
    if (!m.has(v.color_id)) m.set(v.color_id, { id: v.color_id, name: v.color, hex: v.color_hex, hasPhoto: withPhoto.has(v.color_id) })
  })
  // photographed colourways first, otherwise keep catalogue order
  return [...m.values()].sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto))
}

export const defaultColorId = (p) => productColors(p)[0]?.id ?? null

export function imagesFor(p, colorId) {
  if (!p) return []
  const c = colorId ?? defaultColorId(p)
  return p.images.filter((i) => !i.color_id || i.color_id === c)
}
