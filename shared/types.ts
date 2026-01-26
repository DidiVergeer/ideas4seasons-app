// shared/types.ts

/**
 * Product type zoals je API (AFAS test) het teruggeeft.
 * Houd dit bewust "ruim" (veel optional), zodat je geen TS errors krijgt
 * als AFAS later velden toevoegt/weglaat.
 */
export type Product = {
  // basis
  itemcode: string;                 // artikelnummer / id
  description_eng?: string | null;  // omschrijving
  ean?: string | null;

  // prijzen/voorraad
  price?: number | null;
  available_stock?: number | null;

  // categorieën (als je ze al meestuurt)
  category1?: string | null;        // groep (categorie 1)
  category2?: string | null;        // subgroep (categorie 2)

  // verpakking
  outer_carton_qty?: number | null;

  // afbeeldingen
  image_url?: string | null;
  image_urls?: string[] | null;     // voor detail carousel (max 6)

  // verwacht (optioneel)
  expected_date?: string | null;    // bv "2025-12-21"

  // vrije velden / extra info
  unit?: string | null;
  purchase_package_size?: number | null;

  free_fields?: Record<string, string | number | null> | null;

  // fallback voor onbekende velden (handig bij test response)
  [key: string]: unknown;
};
