// components/products/covers.ts
// Centrale plek voor cover mappings (categories + subcategories)
//
// Structuur:
// assets/
// ├─ categories/
// │  ├─ all.jpg
// │  ├─ new.jpg
// │  ├─ glass.jpg
// │  ├─ vases.jpg
// │  ├─ pottery.jpg
// │  ├─ aroma.jpg
// │  ├─ candles.jpg
// │  ├─ led-candles.jpg
// │  ├─ gift-box.jpg
// │  ├─ various.jpg
// │  ├─ sale.jpg
// │  └─ terrarium.jpg
// └─ subcategories/
//    ├─ new/
//    │  ├─ all.jpg
//    │  ├─ spring-2026.jpg
//    │  └─ autumn-2026.jpg
//    └─ glass/
//       ├─ new.jpg
//       ├─ all.jpg
//       ├─ bell-jar.jpg
//       ├─ lamp-dishes.jpg
//       ├─ with-wood.jpg
//       ├─ machine-made.jpg
//       ├─ with-cement.jpg
//       ├─ with-hole.jpg
//       ├─ with-cork.jpg
//       ├─ glass-mirror-plates.jpg
//       ├─ clear-bottles.jpg
//       ├─ empty-terrariums.jpg
//       └─ various.jpg

export const CATEGORY_COVERS: Record<string, any> = {
  // =========================
  // Hoofdcategorieën
  // =========================
  all: require("../../assets/categories/all.jpg"),
  new: require("../../assets/categories/new.jpg"),
  glass: require("../../assets/categories/glass.jpg"),
  vases: require("../../assets/categories/vases.jpg"),
  pottery: require("../../assets/categories/pottery.jpg"),
  aroma: require("../../assets/categories/aroma.jpg"),
  candles: require("../../assets/categories/candles.jpg"),
  "led-candles": require("../../assets/categories/led-candles.jpg"),
  "gift-box": require("../../assets/categories/gift-box.jpg"),
  various: require("../../assets/categories/various.jpg"),
  sale: require("../../assets/categories/sale.jpg"),
  terrarium: require("../../assets/categories/terrarium.jpg"),

  // =========================
  // Subcategorieën — NEW
  // =========================
  "new:all": require("../../assets/subcategories/new/all.jpg"),
  "new:spring-2026": require("../../assets/subcategories/new/spring-2026.jpg"),
  "new:autumn-2026": require("../../assets/subcategories/new/autumn-2026.jpg"),

  // =========================
  // Subcategorieën — GLASS
  // =========================
  "glass:new": require("../../assets/subcategories/glass/new.jpg"),
  "glass:all": require("../../assets/subcategories/glass/all.jpg"),

  "glass:bell-jar": require("../../assets/subcategories/glass/bell-jar.jpg"),
  "glass:lamp-dishes": require("../../assets/subcategories/glass/lamp-dishes.jpg"),

  "glass:with-wood": require("../../assets/subcategories/glass/with-wood.jpg"),
  "glass:machine-made": require("../../assets/subcategories/glass/machine-made.jpg"),

  "glass:with-cement": require("../../assets/subcategories/glass/with-cement.jpg"),
  "glass:with-hole": require("../../assets/subcategories/glass/with-hole.jpg"),
  "glass:with-cork": require("../../assets/subcategories/glass/with-cork.jpg"),

  "glass:glass-mirror-plates": require("../../assets/subcategories/glass/glass-mirror-plates.jpg"),
  "glass:clear-bottles": require("../../assets/subcategories/glass/clear-bottles.jpg"),

  "glass:empty-terrariums": require("../../assets/subcategories/glass/empty-terrariums.jpg"),
  "glass:various": require("../../assets/subcategories/glass/various.jpg"),

    // =========================
  // Subcategorieën — VASES
  // =========================
  "vases:new": require("../../assets/subcategories/vases/new.jpg"),
  "vases:all": require("../../assets/subcategories/vases/all.jpg"),

  "vases:ceramic": require("../../assets/subcategories/vases/ceramic.jpg"),
  "vases:stoneware": require("../../assets/subcategories/vases/stoneware.jpg"),
  "vases:handmade-heavy-glass": require("../../assets/subcategories/vases/handmade-heavy-glass.jpg"),
  "vases:machine-made": require("../../assets/subcategories/vases/machine-made.jpg"),

};



// =========================
// Helpers
// =========================

export function getCategoryCover(categoryId: string) {
  const key = String(categoryId ?? "").trim().toLowerCase();
  return CATEGORY_COVERS[key] ?? null;
}

export function getSubcategoryCover(categoryId: string, subcategoryId: string) {
  const key = `${String(categoryId ?? "").trim().toLowerCase()}:${String(subcategoryId ?? "")
    .trim()
    .toLowerCase()}`;

  // 1️⃣ exacte subcategorie-cover
  if (CATEGORY_COVERS[key]) return CATEGORY_COVERS[key];

  // 2️⃣ fallback naar hoofdcategorie-cover (lowercase-safe)
  const catKey = String(categoryId ?? "").trim().toLowerCase();
  return CATEGORY_COVERS[catKey] ?? null;
}
