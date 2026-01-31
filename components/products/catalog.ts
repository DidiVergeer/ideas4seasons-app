// components/products/catalog.ts
// FULL REPLACEMENT — ✅ FIX: Handmade heavy glass + Machine made vallen nu onder Vases (ook als AFAS category_1 = Glas)
// + Vases subcategorie mapping (New/All/Ceramic/Stoneware/Handmade heavy glass/Machine made)
// Belangrijk:
// - Vases "New" = category_5 == "New articles" (maar alleen binnen Vases)
// - Vases subcats matchen op category_2 (zoals jij stuurde) + losse itemcodes sets
// - Glass logic blijft bestaan, maar Vases-override komt NU vóór de Glass-check (alleen voor die 2 vases-subcats)

export type AfasProductRow = {
  itemcode: string;
  description_eng?: string | null;
  ean?: string | null;

  price?: number | string | null;
  available_stock?: number | string | null;

  // backend response (snake/lowercase)
  outercarton?: number | string | null;
  innercarton?: number | string | null;
  unit?: string | null;

  raw?: {
    OUTERCARTON?: number | string | null;
    INNERCARTON?: number | string | null;
    UNIT?: string | null;
    [k: string]: unknown;
  } | null;

  // ✅ images from backend
  image_url?: string | null; // main
  image_urls?: string[] | null; // all

  // (soms komt het per ongeluk camelCase door)
  imageUrl?: string | null;
  imageUrls?: string[] | null;

  expected_date?: string | null;
  expectedDate?: string | null;

  // ✅ categories from backend (expected)
  category_1?: string | null;
  category_2?: string | null;
  category_3?: string | null;
  category_4?: string | null;
  category_5?: string | null;

  // fallbacks
  category1?: string | null;
  category2?: string | null;
  category3?: string | null;
  category4?: string | null;
  category5?: string | null;

  Webshop_Categorie?: string | null;
  Webshop_Categorie_2?: string | null;
  Webshop_Categorie_3?: string | null;
  Webshop_Categorie_4?: string | null;
  Webshop_Categorie_5?: string | null;

  [key: string]: unknown;
};

export type StockStatus = "in_stock" | "out" | "expected";

export type Product = {
  id: string; // itemcode
  articleNumber: string;
  name: string;
  ean?: string | null;

  price: number;
  availableStock: number;

  // ✅ single source of truth for ordering steps
  outerCartonQty: number;

  // (optional)
  innerCartonQty?: number | null;
  unit?: string | null;

  // ✅ Images
  imageUrl?: string | null; // main image
  images: string[]; // ALWAYS array for carousel + cards fallback
  imageUrls?: string[] | null; // legacy

  expectedDate?: string | null;
  stockStatus: StockStatus;

  // UI navigatie
  categoryId: string;
  categoryName: string;

  // primaire subcat
  subcategoryId: string;
  subcategoryName: string;

  // ✅ EXTRA: voor dubbel tonen (bv. with-cork óók onder empty-terrariums)
  extraSubcategoryIds?: string[];
    // ✅ EXTRA: voor dubbel tonen in categorieën (bv. Sale naast Gift box/Glass/etc.)
  extraCategoryIds?: string[];
};

export type Category = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

export type Subcategory = {
  id: string; // incl "all"
  name: string;
  categoryId: string;
  imageUrl?: string | null;
};

/* =========================
   Helpers
   ========================= */

function toNumberRelaxed(v: unknown, fallback = 0) {
  const n =
    typeof v === "string"
      ? Number(v.trim().replace(",", "."))
      : typeof v === "number"
        ? v
        : NaN;

  return Number.isFinite(n) ? n : fallback;
}

// ✅ strict: géén fallback naar 1 hier (data bug = error)
function toNumberStrict(v: unknown, field: string, ctx: string) {
  if (v === null || v === undefined || v === "") {
    throw new Error(`[DATA BUG] Missing ${field} (${ctx})`);
  }

  const n =
    typeof v === "string"
      ? Number(v.trim().replace(",", "."))
      : typeof v === "number"
        ? v
        : NaN;

  if (!Number.isFinite(n)) {
    throw new Error(`[DATA BUG] Non-numeric ${field}="${String(v)}" (${ctx})`);
  }
  if (n <= 0) {
    throw new Error(`[DATA BUG] ${field} must be > 0, got ${n} (${ctx})`);
  }

  return n;
}

function cleanUrl(u: unknown): string | null {
  if (u === null || u === undefined) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (s === "null" || s === "undefined") return null;
  return s;
}

function normalizeImages(r: AfasProductRow): { main: string | null; all: string[] } {
  const mainRaw = cleanUrl(r.image_url ?? r.imageUrl ?? null);

  const listRaw =
    (Array.isArray(r.image_urls) ? r.image_urls : null) ??
    (Array.isArray(r.imageUrls) ? r.imageUrls : null) ??
    null;

  const cleanedList = (listRaw ?? []).map(cleanUrl).filter(Boolean) as string[];

  const all = [
    ...(mainRaw ? [mainRaw] : []),
    ...cleanedList.filter((u) => u !== mainRaw),
  ];

  const main = all.length > 0 ? all[0] : null;
  return { main, all };
}

function pickFirstString(...vals: any[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

// ✅ robuuster (spaties rond ">" + en-dash)
function normCat(v: string): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/–/g, "-")
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ");
}

function equalsText(a: string, b: string): boolean {
  return normCat(a) === normCat(b);
}

function containsText(haystack: string, needle: string): boolean {
  return normCat(haystack).includes(normCat(needle));
}

function getCategoryFields(r: AfasProductRow) {
  const c1 = pickFirstString(
    r.category_1,
    r.category1,
    r.Webshop_Categorie,
    (r as any).WebshopCategorie,
    (r as any).webshop_categorie
  );
  const c2 = pickFirstString(r.category_2, r.category2, r.Webshop_Categorie_2);
  const c3 = pickFirstString(r.category_3, r.category3, r.Webshop_Categorie_3);
  const c4 = pickFirstString(r.category_4, r.category4, r.Webshop_Categorie_4);
  const c5 = pickFirstString(r.category_5, r.category5, r.Webshop_Categorie_5);

  return { c1, c2, c3, c4, c5 };
}

function normalizeItemcodeDigits(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

// We checken BOTH raw en digits (want AFAS kan I34100 / 034100 / 34100 leveren)
function getItemKeys(raw: unknown): string[] {
  const r = String(raw ?? "").trim();
  const d = normalizeItemcodeDigits(raw);
  const keys = [r, d].map((x) => String(x ?? "").trim()).filter(Boolean);
  return Array.from(new Set(keys));
}

/* =========================================================
   Glass subcategory rules (AFAS category_2/_3/_4/_5 + itemcodes)
   ========================================================= */

const GLASS_LAMP_DISHES = new Set<string>([
  "34100",
  "34101",
  "34102",
  "34103",
  "34104",
  "34105",
  "34106",
  "34108",
  "34120",
  "34121",
  "34122",
  "34125",
  "34126",
]);

// Clear bottles (zoals het al goed werkt)
const GLASS_CLEAR_BOTTLES = new Set<string>([
  "129191",
  "129192",
  "129193",
  "129194",
  "129195",
  "129196",
  "129197",
  "129198",
  "229196",
  "28060",
  "28062",
  "28069",
  "28071",
  "28072",
  "28075",
  "29180",
  "29670",
  "29680",
  "29720",
  "29730",
  "29740",
  "29760",
  "29780",
  "29790",
  "29800",
  "29880",
  "29890",
  "29900",
  "29910",
  "35240",
  "35250",
  "35300",
  "35320",
  "35330",
  "529198",
]);

// ✅ Machine made extra itemcodes (jij wil deze los erbij zien)
const GLASS_MACHINE_MADE_CODES = new Set<string>([
  "28068",
  "29739",
  "35140",
  "35141",
  "35142",
  "35143",
  "35170",
  "35171",
  "35172",
  "35173",
  "35190",
  "35191",
  "35192",
  "35193",
]);

const LED_CHARGEABLE = new Set(["30157", "30158"]);

type SubPick = { id: string; name: string };

const GLASS_SUBNAME: Record<string, string> = {
  new: "New",
  all: "All",
  "bell-jar": "Bell jar",
  "lamp-dishes": "Lamp & dishes",
  "with-wood": "With wood",
  "machine-made": "Machine made",
  "with-cement": "With cement",
  "with-hole": "With hole",
  "with-cork": "With cork",
  "glass-mirror-plates": "Glass / Mirror plates",
  "clear-bottles": "Clear bottles",
  "empty-terrariums": "Empty terrariums",
  various: "Various",
};

function pickGlass(id: keyof typeof GLASS_SUBNAME): SubPick {
  return { id, name: GLASS_SUBNAME[id] };
}

// ✅ we returnen nu primary + extras (voor dubbel tonen)
function inferGlassSubcategories(r: AfasProductRow): { primary: SubPick; extras: SubPick[] } {
  const { c2, c3, c4, c5 } = getCategoryFields(r);

  const itemKeys = getItemKeys(r.itemcode);
  const c2n = normCat(c2 || "");
  const c3n = normCat(c3 || "");
  const c4n = normCat(c4 || "");
  const c5n = normCat(c5 || "");

  const hits: string[] = [];

  // A) New binnen Glass
  if (equalsText(c5n, "new articles")) hits.push("new");

  // B) Itemcode buckets
  for (const k of itemKeys) {
    const kd = normalizeItemcodeDigits(k);

    if (GLASS_LAMP_DISHES.has(k) || GLASS_LAMP_DISHES.has(kd)) hits.push("lamp-dishes");
    if (GLASS_CLEAR_BOTTLES.has(k) || GLASS_CLEAR_BOTTLES.has(kd)) hits.push("clear-bottles");
    if (GLASS_MACHINE_MADE_CODES.has(k) || GLASS_MACHINE_MADE_CODES.has(kd)) hits.push("machine-made");
  }

  // C) Empty terrariums via category_4 (maar mag later “extra” worden)
  if (
    c4n &&
    (containsText(c4n, "glas > lege terrariums") ||
      containsText(c4n, "lege terrariums") ||
      containsText(c4n, "empty terrariums") ||
      containsText(c4n, "lege terrarium"))
  ) {
    hits.push("empty-terrariums");
  }

  // D) Bell jar (jouw fix) via category_3
  if (
    c3n &&
    (containsText(c3n, "glas > glas stolp") ||
      containsText(c3n, "glas stolp") ||
      containsText(c3n, "stolp"))
  ) {
    hits.push("bell-jar");
  }

  // E) With hole (jouw fix) via category_3 "for tealight"
  if (
    c3n &&
    (containsText(c3n, "glas > for tealight") ||
      containsText(c3n, "for tealight") ||
      containsText(c3n, "tealight") ||
      containsText(c3n, "tea light"))
  ) {
    hits.push("with-hole");
  }

  // F) Category_2 text buckets (breed)
  if (c2n && (containsText(c2n, "glas with wood") || containsText(c2n, "with wood"))) hits.push("with-wood");
  if (c2n && (containsText(c2n, "glas with cement") || containsText(c2n, "with cement"))) hits.push("with-cement");

  // “with hole” ook op c2 laten bestaan (sommige rijen kunnen dit zo hebben)
  if (c2n && (containsText(c2n, "glas with hole") || containsText(c2n, "with hole"))) hits.push("with-hole");

  // with cork (ook NL “kurk”)
  if (
    c2n &&
    (containsText(c2n, "glas with cork") ||
      containsText(c2n, "with cork") ||
      containsText(c2n, "kurk") ||
      containsText(c2n, "cork"))
  ) {
    hits.push("with-cork");
  }

  // Glass / Mirror plates
  if (
    c2n &&
    (containsText(c2n, "glas plateau") ||
      containsText(c2n, "plateau") ||
      containsText(c2n, "mirror") ||
      containsText(c2n, "mirrors"))
  ) {
    hits.push("glass-mirror-plates");
  }

  // Various = overige glas
  if (
    c2n &&
    (containsText(c2n, "overige glas") ||
      containsText(c2n, "overig glas") ||
      containsText(c2n, "other glass"))
  ) {
    hits.push("various");
  }

  // Machine made exact category_2 lijst (zoals jij stuurde)
  const machineExactList = [
    "glas > colored berlijn - bologne",
    "glas > colored rome - porto - paris",
    "glas > colored lille - milano - fleur - riga",
    "glas > colored venice - florence",
    "glas > kristal bouquet vase",
    "glas > dalia vase",
    "glas > colored trevi/ bellagio",
    "glas > home",

    "glass > colored berlijn - bologne",
    "glass > colored rome - porto - paris",
    "glass > colored lille - milano - fleur - riga",
    "glass > colored venice - florence",
    "glass > kristal bouquet vase",
    "glass > dalia vase",
    "glass > colored trevi/ bellagio",
    "glass > home",
  ];
  for (const s of machineExactList) {
    if (c2n && containsText(c2n, s)) {
      hits.push("machine-made");
      break;
    }
  }

  const uniqHits = Array.from(new Set(hits));

  const priority: string[] = [
    "new",
    "lamp-dishes",
    "clear-bottles",
    "machine-made",
    "bell-jar",
    "with-wood",
    "with-cement",
    "with-hole",
    "with-cork",
    "glass-mirror-plates",
    "empty-terrariums",
    "various",
  ];

  let primaryId = "all";
  for (const p of priority) {
    if (uniqHits.includes(p)) {
      primaryId = p;
      break;
    }
  }

  const extras = uniqHits
    .filter((id) => id !== primaryId && id !== "all")
    .map((id) => ({ id, name: GLASS_SUBNAME[id] ?? id }));

  return { primary: { id: primaryId, name: GLASS_SUBNAME[primaryId] ?? primaryId }, extras };
}

/* =========================================================
   Vases subcategory rules (AFAS category_2 + category_5 + itemcodes)
   ========================================================= */

const VASES_SUBNAME: Record<string, string> = {
  new: "New",
  all: "All",
  ceramic: "Ceramic",
  stoneware: "Stoneware",
  "handmade-heavy-glass": "Handmade heavy glass",
  "machine-made": "Machine made",
};

function isNewArticlesRow(r: AfasProductRow): boolean {
  const { c5 } = getCategoryFields(r);
  return equalsText(c5 || "", "New articles");
}

const VASES_CERAMIC_EXTRA = new Set<string>(["35174", "35175", "35176"]);

const VASES_MACHINE_MADE_EXTRA = new Set<string>([
  "28068",
  "29739",
  "35140",
  "35141",
  "35142",
  "35143",
  "35170",
  "35171",
  "35172",
  "35173",
  "35190",
  "35191",
  "35192",
  "35193",
]);

const VASES_CERAMIC_C2_EXACT = new Set<string>([
  "pottery > bubbles vase",
  "glass > conical vase golden heart",
  "glass> conical vase golden heart",
  "ceramic vase > dazzle vase",
  "ceramic vase> marmer vase",
  "ceramic vase > chubby vase",
  "ceramic vase > trevi",
  "ceramic vase > liva & maya & ayla",
  "ceramic vase> collar vase",
  "ceramic vase> shoulder vase",
]);

const VASES_STONEWARE_C2_EXACT = new Set<string>([
  "ceramic vase > tulip strollz vase",
  "ceramic vase> pebble",
  "ceramic vase> table",
  "ceramic vase> carambola",
  "ceramic vase > delphi-windmill",
  "ceramic vase> rainbow vase",
  "ceramic vase > bird & peacock & bootie",
  "ceramic vase > bali",
]);

const VASES_HANDMADE_HEAVY_GLASS_C2_EXACT = new Set<string>([
  "glas > bossom vase",
  "glas > handcraft rose - lily - lupin",
  "glas > handcraft rose – lily – lupin",
  "glas > cameleon vase",
  "glas > hangbag vase",
  "glas > classy retro glass",

  // soms staat het ook als "glass"
  "glass > bossom vase",
  "glass > handcraft rose - lily - lupin",
  "glass > cameleon vase",
  "glass > hangbag vase",
  "glass > classy retro glass",
]);

const VASES_MACHINE_MADE_C2_EXACT = new Set<string>([
  "glas > colored berlijn - bologne",
  "glas > colored rome - porto - paris",
  "glas > colored lille - milano - fleur - riga",
  "glas > colored venice - florence",
  "glas > kristal bouquet vase",
  "glas > dalia vase",
  "glas > colored trevi/ bellagio",
  "glas > home",

  // soms staat het ook als "glass"
  "glass > colored berlijn - bologne",
  "glass > colored rome - porto - paris",
  "glass > colored lille - milano - fleur - riga",
  "glass > colored venice - florence",
  "glass > kristal bouquet vase",
  "glass > dalia vase",
  "glass > colored trevi/ bellagio",
  "glass > home",
]);

function inferVasesSubcategories(r: AfasProductRow): { primary: SubPick; extras: SubPick[] } {
  const { c2 } = getCategoryFields(r);
  const c2n = normCat(c2 || "");

  const itemKeys = getItemKeys(r.itemcode);

  const hits: string[] = [];

  // A) New binnen Vases
  if (isNewArticlesRow(r)) hits.push("new");

  // B) Losse itemcode overrides
  for (const k of itemKeys) {
    const kd = normalizeItemcodeDigits(k);

    if (VASES_CERAMIC_EXTRA.has(k) || VASES_CERAMIC_EXTRA.has(kd)) hits.push("ceramic");
    if (VASES_MACHINE_MADE_EXTRA.has(k) || VASES_MACHINE_MADE_EXTRA.has(kd)) hits.push("machine-made");
  }

  // C) Exact category_2 mapping (genormaliseerd vergelijken)
const hasNorm = (set: Set<string>, valueNorm: string) =>
  Array.from(set).some((v) => normCat(v) === valueNorm);

if (c2n && hasNorm(VASES_CERAMIC_C2_EXACT, c2n)) hits.push("ceramic");
if (c2n && hasNorm(VASES_STONEWARE_C2_EXACT, c2n)) hits.push("stoneware");
if (c2n && hasNorm(VASES_HANDMADE_HEAVY_GLASS_C2_EXACT, c2n)) hits.push("handmade-heavy-glass");
if (c2n && hasNorm(VASES_MACHINE_MADE_C2_EXACT, c2n)) hits.push("machine-made");

  const uniqHits = Array.from(new Set(hits));
  const priority: string[] = ["new", "ceramic", "stoneware", "handmade-heavy-glass", "machine-made"];

  let primaryId = "all";
  for (const p of priority) {
    if (uniqHits.includes(p)) {
      primaryId = p;
      break;
    }
  }

  const extras = uniqHits
    .filter((id) => id !== primaryId && id !== "all")
    .map((id) => ({ id, name: VASES_SUBNAME[id] ?? id }));

  return { primary: { id: primaryId, name: VASES_SUBNAME[primaryId] ?? primaryId }, extras };
}

function inferAromaSubcategory(r: AfasProductRow) {
  const { c2, c5 } = getCategoryFields(r);

  if (containsText(c2 || "", "access")) return { subId: "accessories", subName: "Accessories" };
  if (containsText(c2 || "", "cubes")) return { subId: "cubes", subName: "Cubes" };
  if (containsText(c2 || "", "aroma > gift set") || containsText(c2 || "", "gift set")) {
  return { subId: "giftbox", subName: "Aroma gift box" };
}
  if (containsText(c2 || "", "shapes")) return { subId: "shapes", subName: "Shapes" };
  if (containsText(c2 || "", "bowl")) return { subId: "bowl", subName: "Bowl" };
  if (containsText(c2 || "", "diffuser")) return { subId: "diffusers", subName: "Diffusers" };

  return { subId: "all", subName: "Alle artikelen" };
}

function inferCandlesSubcategory(r: AfasProductRow) {
  const { c2, c5 } = getCategoryFields(r);

  if (equalsText(c5 || "", "New articles")) return { subId: "new", subName: "New" };

  // candle holders (soms onder Glass)
  if (containsText(c2 || "", "bubble tealight holder") || containsText(c2 || "", "candle holder")) {
    return { subId: "candle-holders", subName: "Candle holders" };
  }

  if (containsText(c2 || "", "bliss dinner")) return { subId: "bliss", subName: "Bliss dinner" };
  if (containsText(c2 || "", "pearlsand")) return { subId: "pearlsand", subName: "Pearlsand" };
  if (containsText(c2 || "", "pimped")) return { subId: "pimped", subName: "Pimped" };
  if (containsText(c2 || "", "dip dye")) return { subId: "dip-dye", subName: "Dip Dye" };
  if (containsText(c2 || "", "gold spray")) return { subId: "gold-spray", subName: "Dinner gold spray" };
  if (containsText(c2 || "", "tree")) return { subId: "tree", subName: "Tree" };
  if (containsText(c2 || "", "taper")) return { subId: "taper", subName: "Taper" };
  if (containsText(c2 || "", "pencil")) return { subId: "pencil", subName: "Pencil" };

  return { subId: "all", subName: "Alle artikelen" };
}

function inferLedCandleSubcategory(r: AfasProductRow) {
  const { c2, c5 } = getCategoryFields(r);
  const c2n = normCat(c2 || "");

  console.log("LED_CAT2_DEBUG", r.itemcode, {
  c2_raw: (r as any).category_2,
  webshop2: (r as any).Webshop_Categorie_2,
  c2_used: c2,
  c2n,
});

// Match alles wat eindigt op het stuk NA ">"
function c2RightIs(right: string) {
  const rn = normCat(right);
  // werkt voor: "candle> X", "Candles> X", "led candle> X", "led candles> X"
  return c2n.endsWith(" > " + rn) || c2n === rn;
}

  const item = normalizeItemcodeDigits((r as any)?.itemcode);
  if (LED_CHARGEABLE.has(String(item))) return { subId: "chargeable", subName: "Chargeable" };

  const isNew = equalsText(c5 || "", "New articles");

// ✅ AFAS varianten: match op het deel NA ">" (robust voor candle/led candle/Candles/led candles)
if (c2RightIs("cannelure")) {
  return { subId: "cannelure", subName: "Cannelure" };
}

if (c2RightIs("wood candle")) {
  return { subId: "wood", subName: "Wood" };
}

if (c2RightIs("led candle tracy")) {
  return { subId: "tracy", subName: "Tracy" };
}

if (c2RightIs("led wax shape")) {
  return { subId: "wax-shape", subName: "Wax shape" };
}
  if (containsText(c2 || "", "pillar")) return { subId: "pillar", subName: "Pillar" };
  if (containsText(c2 || "", "pencil")) return { subId: "pencil", subName: "Pencil" };
  if (containsText(c2 || "", "honeycomb")) return { subId: "honeycomb", subName: "Honeycomb" };
  if (containsText(c2 || "", "floating")) return { subId: "floating", subName: "Floating" };

  // oil lamp / nooili / led with glass
  if (containsText(c2 || "", "nooili") || containsText(c2 || "", "oil") || containsText(c2 || "", "led with glass")) {
    return { subId: "oil-lamp", subName: "Oil lamp" };
  }

  if (containsText(c2 || "", "dinner")) return { subId: "dinner", subName: "Dinner" };

  // Various = "Led candle > led"
  if (containsText(c2 || "", " > led") || equalsText(c2 || "", "led candle > led")) {
    return { subId: "various", subName: "Various" };
  }

    // ✅ fallback: als het New is, maar we hebben geen match gevonden -> zet hem in LED -> New
  if (isNew) return { subId: "new", subName: "New" };

  return { subId: "all", subName: "Alle artikelen" };
}

function inferPotterySubcategory(r: AfasProductRow) {
  const { c2, c5 } = getCategoryFields(r);

console.log("POTTERY_MAP", r.itemcode, { c2, c5 });
  const c2n = normCat(c2 || "");

  // Exact category_2 mapping (zoals jouw lijst)
  if (equalsText(c2n, "pottery > houses")) return { subId: "houses", subName: "Houses" };
  if (equalsText(c2n, "pottery > pot with glasses")) return { subId: "glasses", subName: "Pot with glasses" };
  if (equalsText(c2n, "pottery > pot with wood legs")) return { subId: "wood", subName: "Pot with wood legs" };
  if (equalsText(c2n, "pottery > pot palma & ibiza")) return { subId: "palma", subName: "Palma & Ibiza pot" };

  // Bubbles & Rise
  if (equalsText(c2n, "pottery > bubbles pot") || equalsText(c2n, "pottery > rise pot")) {
    return { subId: "rise", subName: "Bubbles & Rise pot" };
  }

  // Pouff & Chubby
  if (equalsText(c2n, "pottery > pouff pottery") || equalsText(c2n, "pottery > chubby")) {
    return { subId: "chubby", subName: "Pouff & Chubby pot" };
  }

  // Shiny glaze head
  if (equalsText(c2n, "pottery > shiny glaze head")) return { subId: "walk", subName: "Shiny glaze head" };

  // Bricks & Carre
  if (equalsText(c2n, "pottery > bricks") || equalsText(c2n, "pottery > pot carre")) {
    return { subId: "carre", subName: "Bricks & Carre pot" };
  }

  // Line & Daydream
  if (equalsText(c2n, "pottery > line pot") || equalsText(c2n, "pottery > daydream")) {
    return { subId: "daydream", subName: "Line & Daydream pot" };
  }

  // Hanoi, Marble, Wave
  if (
    equalsText(c2n, "pottery > hanoi") ||
    equalsText(c2n, "pottery > marble pot") ||
    equalsText(c2n, "pottery > wave")
  ) {
    return { subId: "hanoi", subName: "Hanoi, Marble & Wave pot" };
  }

  // Diverse / Queen+lady / Embrace
  if (
    equalsText(c2n, "pottery > diverse") ||
    equalsText(c2n, "pottery > queen + lady nature") ||
    equalsText(c2n, "pottery > embrace")
  ) {
    return { subId: "diverse", subName: "Diverse" };
  }

  return { subId: "all", subName: "Alle artikelen" };
}

// ✅ Helper: detecteer de vase-subcats die in AFAS onder "Glas" hangen
function isVasesGlassBucket(r: AfasProductRow): boolean {
  const { c2 } = getCategoryFields(r);
  const c2n = normCat(c2 || "");

  if (VASES_HANDMADE_HEAVY_GLASS_C2_EXACT.has(c2n)) return true;
  if (VASES_MACHINE_MADE_C2_EXACT.has(c2n)) return true;

  const keys = getItemKeys(r.itemcode);
  for (const k of keys) {
    const kd = normalizeItemcodeDigits(k);
    if (VASES_MACHINE_MADE_EXTRA.has(k) || VASES_MACHINE_MADE_EXTRA.has(kd)) return true;
  }

  return false;
}

/* =========================================================
   Category mapping (Category 1 + special rules)
   ========================================================= */

  
function inferCategoryFromRow(r: AfasProductRow): {
  catId: string;
  catName: string;
  subId: string;
  subName: string;
  extraSubIds: string[];
} {
  const { c1, c2, c3, c4, c5 } = getCategoryFields(r);

  const c1n = normCat(c1 || "");
  const c3n = normCat(c3 || "");
  const c5n = normCat(c5 || "");

  // ✅ OVERRIDE: Aroma Gift set valt onder Aroma -> giftbox, ook als category_1 = Gift box
if (containsText(c2 || "", "aroma > gift set") || containsText(c2 || "", "gift set")) {
  return {
    catId: "aroma",
    catName: "Aroma",
    subId: "giftbox",
    subName: "Aroma gift box",
    extraSubIds: [],
  };
}

    // =========================
  // ✅ Aroma / Candles / LED candle / Pottery overrides + mapping
  // (moet boven Glass/Vases/New etc.)
  // =========================

// 1) HARD override: candle holders die AFAS soms onder Glass zet
// ✅ maar: alleen échte lamp-dishes codes moeten NIET naar Candles
if (containsText(c2 || "", "bubble tealight holder")) {
  const keys = getItemKeys((r as any)?.itemcode); // raw + digits
  const isLampDish = keys.some((k) => GLASS_LAMP_DISHES.has(k));

  if (!isLampDish) {
    const { subId, subName } = inferCandlesSubcategory(r);
    return { catId: "candles", catName: "Candles", subId, subName, extraSubIds: [] };
  }
  // als het wél lamp-dishes is: laat 'm doorvallen naar de Glass override hieronder
}

  // 2) LED chargeable override (op itemcode)
  {
    const item = normalizeItemcodeDigits((r as any)?.itemcode);
    if (LED_CHARGEABLE.has(String(item))) {
      const { subId, subName } = inferLedCandleSubcategory(r);
      return { catId: "led-candles", catName: "Led candle", subId, subName, extraSubIds: [] };
    }
  }

  // 3) Aroma (category_1 = Aroma)
  if (c1n === "aroma") {
    const { subId, subName } = inferAromaSubcategory(r);
    return { catId: "aroma", catName: "Aroma", subId, subName, extraSubIds: [] };
  }

  // 4) Candles (category_1 = Candles)
  if (c1n === "candles" || c1n === "kaarsen" || c1n === "candle") {
    const { subId, subName } = inferCandlesSubcategory(r);
    return { catId: "candles", catName: "Candles", subId, subName, extraSubIds: [] };
  }

  // 5) Led candle (AFAS varianten)
  if (c1n === "led candle" || c1n === "led candles" || c1n === "led kaarsen" || c1n === "ledcandle") {
    const { subId, subName } = inferLedCandleSubcategory(r);
    return { catId: "led-candles", catName: "Led candle", subId, subName, extraSubIds: [] };
  }

  // 6) Sommige LED regels lijken in category_2 op "Candles > led candle tracy"
  if (containsText(c2 || "", "led candle")) {
    const { subId, subName } = inferLedCandleSubcategory(r);
    return { catId: "led-candles", catName: "Led candle", subId, subName, extraSubIds: [] };
  }

  // 7) Pottery (category_1 = Pottery)
if (c1n === "pottery") {
  const { subId, subName } = inferPotterySubcategory(r);
  return {
    catId: "pottery",
    catName: "Pottery",
    subId,
    subName,
    extraSubIds: [],
  };
}

  // ✅ GLASS
  if (c1n === "glas" || c1n === "glass") {
    const { primary, extras } = inferGlassSubcategories(r);
    return {
      catId: "glass",
      catName: "Glass",
      subId: primary.id,
      subName: primary.name,
      extraSubIds: extras.map((x) => x.id),
    };
  }

  // ✅ VASES (before New hoofdcategory)
  if (
    c1n === "ceramic vases" ||
    c1n === "keramiek vazen" ||
    c1n === "ceramic vase" ||
    c1n === "vases" ||
    c1n === "vazen" ||
    containsText(c1n, "vase")
  ) {
    const { primary, extras } = inferVasesSubcategories(r);
    return {
      catId: "vases",
      catName: "Vases",
      subId: primary.id,
      subName: primary.name,
      extraSubIds: extras.map((x) => x.id),
    };
  }

  // ✅ NEW hoofdcategory (non-glass)
  if (equalsText(c5 || "", "New articles")) {
    if (equalsText(c4 || "", "Spring 2026 collectie")) {
      return { catId: "new", catName: "New", subId: "spring-2026", subName: "Spring 2026", extraSubIds: [] };
    }
    if (equalsText(c4 || "", "Autumn 2026")) {
      return { catId: "new", catName: "New", subId: "autumn-2026", subName: "Autumn 2026", extraSubIds: [] };
    }
    return { catId: "new", catName: "New", subId: "all", subName: "All", extraSubIds: [] };
  }

// ✅ CATEGORY_1 moet winnen van "Themes -> various"
// Anders verdwijnen Gift box / Terrarium items met gevulde category_3 naar Various.

if (equalsText(c1 || "", "gift box") || equalsText(c1 || "", "gift-box") || containsText(c1n, "gift box")) {
  return { catId: "gift-box", catName: "Gift box", subId: "all", subName: "Alle artikelen", extraSubIds: [] };
}

if (equalsText(c1 || "", "terrarium") || equalsText(c1 || "", "terrariums") || containsText(c1n, "terrarium")) {
  return { catId: "terrarium", catName: "Terrarium", subId: "all", subName: "Alle artikelen", extraSubIds: [] };
}


  // ✅ Themes -> various (non-glass)
  if (String(c3n || "").trim().length > 0) {
    return { catId: "various", catName: "Various", subId: "all", subName: "All", extraSubIds: [] };
  }

  // ✅ Overige Category 1 mappings
 if (c1n === "pottery") {
  const { subId, subName } = inferPotterySubcategory(r);
  return { catId: "pottery", catName: "Pottery", subId, subName, extraSubIds: [] };
}
  if (c1n === "aroma") {
    return { catId: "aroma", catName: "Aroma", subId: "all", subName: "All", extraSubIds: [] };
  }
  if (c1n === "candles" || c1n === "kaarsen" || c1n === "candle") {
    return { catId: "candles", catName: "Candles", subId: "all", subName: "All", extraSubIds: [] };
  }
  if (c1n === "led candle" || c1n === "led candles" || c1n === "led kaarsen") {
    return { catId: "led-candles", catName: "LED candles", subId: "all", subName: "All", extraSubIds: [] };
  }
  if (c1n === "gift box" || c1n === "gift boxes" || c1n === "giftbox") {
  return { catId: "gift-box", catName: "Gift box", subId: "all", subName: "Alle artikelen", extraSubIds: [] };
}
  if (c1n === "diverse" || c1n === "various") {
    return { catId: "various", catName: "Various", subId: "all", subName: "All", extraSubIds: [] };
  }
  if (c1n === "terrarium" || c1n === "terrariums") {
    return { catId: "terrarium", catName: "Terrarium", subId: "all", subName: "All", extraSubIds: [] };
  }

  return { catId: "various", catName: "Various", subId: "all", subName: "All", extraSubIds: [] };
}

/* =========================
   Mapping row -> Product
   ========================= */

export function mapAfasRowToProduct(r: AfasProductRow): Product {
  const name = (r.description_eng ?? r.itemcode ?? "").toString();
  const ctx = `itemcode=${String(r.itemcode)}`;

  const price = toNumberRelaxed(r.price, 0);
  const availableStock = toNumberRelaxed(r.available_stock, 0);

  const rawOuter = r.outercarton ?? r.raw?.OUTERCARTON;
  const outerCartonQty = toNumberStrict(rawOuter, "outercarton", ctx);

  const rawInner = r.innercarton ?? r.raw?.INNERCARTON;
  const innerCartonQty = rawInner == null ? null : toNumberRelaxed(rawInner, 0);

  const expected = (r.expected_date ?? r.expectedDate ?? null) as string | null;

  const stockStatus: StockStatus = availableStock > 0 ? "in_stock" : expected ? "expected" : "out";

  const { catId, catName, subId, subName, extraSubIds } = inferCategoryFromRow(r);

// ✅ we gaan extraSubcategoryIds uitbreiden in deze functie
const extraSubcategoryIds: string[] = Array.isArray(extraSubIds) ? [...extraSubIds] : [];

// ✅ LED candles: als het New articles is, dan óók tonen in subcategorie "new"
// (maar alleen als primary subId niet al "new" is)
{
  const { c5 } = getCategoryFields(r);
  if (catId === "led-candles" && equalsText(c5 || "", "New articles") && subId !== "new") {
    extraSubcategoryIds.push("new");
  }
}

// ✅ Pottery: als het New articles is, dan óók tonen in Pottery -> New
// (maar primary blijft gewoon houses/palma/etc.)
{
  const { c5 } = getCategoryFields(r);
  if (catId === "pottery" && equalsText(c5 || "", "New articles") && subId !== "new") {
    extraSubcategoryIds.push("new");
  }
}

  // ✅ Extra categorie-labels (zonder primary category te overschrijven)
  const { c1, c5 } = getCategoryFields(r);
  const c1n = normCat(c1 || "");
  const c5n = normCat(c5 || "");
  const c4 = getCategoryFields(r).c4;
const c4n = normCat(c4 || "");

  const extraCategoryIds: string[] = [];

  // ✅ NEW als extra categorie (zodat alle "New articles" ook zichtbaar zijn onder New)
if (equalsText(c5 || "", "New articles")) {
  extraCategoryIds.push("new");

  // Autumn 2026
  if (containsText(c4n, "autumn 2026")) {
    extraSubcategoryIds.push("autumn-2026");
  }

  // Spring 2026 (komt soms als "Spring 2026 collectie")
  if (containsText(c4n, "spring 2026")) {
    extraSubcategoryIds.push("spring-2026");
  }
}

  // ✅ Lamp & dishes: óók tonen onder Glass (dubbel), zonder primary category te veranderen
{
  const keys = getItemKeys((r as any)?.itemcode); // raw + digits
  const isLampDish = keys.some((k) => GLASS_LAMP_DISHES.has(k));

  if (isLampDish) {
    extraCategoryIds.push("glass");          // toon ook onder Glass
    extraSubcategoryIds.push("lamp-dishes"); // en specifiek in Glass -> Lamp & dishes
  }
}

  // ✅ Glass vase-buckets óók tonen onder Vases (dubbel)
// + geef ook de juiste Vases-subcategorie mee, anders blijft Vases->Handmade heavy glass leeg
if (isVasesGlassBucket(r)) {
  extraCategoryIds.push("vases");

  const { primary, extras } = inferVasesSubcategories(r);

  // primaire vases subcat (bijv. handmade-heavy-glass / machine-made)
  if (primary?.id && primary.id !== "all") {
    extraSubcategoryIds.push(primary.id);
  }

  // eventuele extra vases subcats (als je die ooit gebruikt)
  for (const e of extras ?? []) {
    if (e?.id && e.id !== "all") extraSubcategoryIds.push(e.id);
  }
}

  // ✅ Sale als extra categorie
  const isSale = equalsText(c5 || "", "sale") || c5n.endsWith(" > sale");
  if (isSale) extraCategoryIds.push("sale");

  // ✅ Alles met AFAS category_1 = gift box óók tonen onder Gift box
  // (nodig voor Aroma gift sets die primair onder Aroma vallen)
  const isGiftBoxC1 =
    equalsText(c1 || "", "gift box") ||
    equalsText(c1 || "", "gift-box") ||
    c1n === "gift box" ||
    c1n === "gift-box" ||
    c1n === "giftbox";

  if (isGiftBoxC1) extraCategoryIds.push("gift-box");

  const { main, all } = normalizeImages(r);

  return {
    id: String(r.itemcode),
    articleNumber: String(r.itemcode),
    name,
    ean: (r.ean ?? null) as string | null,

    price,
    availableStock,

    outerCartonQty,
    innerCartonQty,
    unit: (r.unit ?? r.raw?.UNIT ?? null) as string | null,

    imageUrl: main,
    images: all,
    imageUrls: all,

    expectedDate: expected,
    stockStatus,

    categoryId: catId,
    categoryName: catName,
    subcategoryId: subId,
    subcategoryName: subName,

    extraSubcategoryIds: extraSubcategoryIds.length
  ? Array.from(new Set(extraSubcategoryIds))
  : undefined,
    extraCategoryIds: extraCategoryIds.length ? Array.from(new Set(extraCategoryIds)) : undefined,
  };
}

/* =========================
   Category ordering
   ========================= */

const CATEGORY_ORDER: { id: string; name: string }[] = [
  { id: "all", name: "All" },
  { id: "new", name: "New" },
  { id: "glass", name: "Glass" },
  { id: "vases", name: "Vases" },
  { id: "pottery", name: "Pottery" },
  { id: "aroma", name: "Aroma" },
  { id: "candles", name: "Candles" },
  { id: "led-candles", name: "LED candles" },
  { id: "gift-box", name: "Gift box" },
  { id: "various", name: "Various" },
  { id: "sale", name: "Sale" },
  { id: "terrarium", name: "Terrarium" },
];

/* =========================
   Build category tree
   ========================= */

export function buildCategoryTree(products: Product[]): {
  categories: Category[];
  subcategoriesByCategory: Record<string, Subcategory[]>;
} {
  const catMap = new Map<string, Category>();
  const subMap = new Map<string, Map<string, Subcategory>>();

  catMap.set("all", { id: "all", name: "All", imageUrl: null });
  subMap.set("all", new Map([["all", { id: "all", name: "All", categoryId: "all", imageUrl: null }]]));

  for (const p of products) {
    if (!catMap.has(p.categoryId)) {
      catMap.set(p.categoryId, { id: p.categoryId, name: p.categoryName, imageUrl: null });
    }

    if (!subMap.has(p.categoryId)) subMap.set(p.categoryId, new Map());
    const s = subMap.get(p.categoryId)!;

    if (!s.has("all")) {
      s.set("all", { id: "all", name: "All", categoryId: p.categoryId, imageUrl: null });
    }

    // primary subcat
    if (p.subcategoryId && !s.has(p.subcategoryId)) {
      s.set(p.subcategoryId, {
        id: p.subcategoryId,
        name: p.subcategoryName,
        categoryId: p.categoryId,
        imageUrl: null,
      });
    }

    // ✅ extra subcats (voor dubbel tonen)
    const extras = Array.isArray(p.extraSubcategoryIds) ? p.extraSubcategoryIds : [];
    for (const sid of extras) {
      if (!sid) continue;
      if (!s.has(sid)) {
        // name lookup: glass subnames + vases subnames
        const nm = (GLASS_SUBNAME as any)[sid] ?? (VASES_SUBNAME as any)[sid] ?? sid;
        s.set(sid, {
          id: sid,
          name: nm,
          categoryId: p.categoryId,
          imageUrl: null,
        });
      }
    }
  }

  const byId = new Map(CATEGORY_ORDER.map((c) => [c.id, c.name]));
  const known: Category[] = [];
  const unknown: Category[] = [];

  for (const c of catMap.values()) {
    if (byId.has(c.id)) known.push({ ...c, name: byId.get(c.id)! });
    else unknown.push(c);
  }

  known.sort(
    (a, b) =>
      CATEGORY_ORDER.findIndex((x) => x.id === a.id) - CATEGORY_ORDER.findIndex((x) => x.id === b.id)
  );
  unknown.sort((a, b) => a.name.localeCompare(b.name));

  const categories = [...known, ...unknown];

  const subcategoriesByCategory: Record<string, Subcategory[]> = {};
  for (const [catId, sMap] of subMap.entries()) {
    subcategoriesByCategory[catId] = Array.from(sMap.values());
  }

  return { categories, subcategoriesByCategory };
}
