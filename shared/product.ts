// shared/product.ts

// ISO language code, e.g. "nl", "en", "de", ...
export type LanguageCode = string;

export type ProductImagesList = {
  thumbUrl?: string | null;
};

export type ProductImagesDetail = ProductImagesList & {
  primaryUrl?: string | null;
  galleryUrls?: string[]; // max 6 (enforce in backend)
};

export type ProductListItem = {
  itemcode: string;
  description: string;
  ean?: string | null;

  price: number;
  currency: "EUR";

  availableStock?: number | null;
  unit?: string | null;

  packaging: {
    outerCartonQty: number; // REQUIRED
    innerCartonQty?: number | null;
  };

  ecommerceAvailable: boolean;

  // filtervelden (later vullen)
  category?: string | null;
  type?: string | null;
  brand?: string | null;

  // images (mag ontbreken)
  images?: ProductImagesList;

  updatedAt?: string; // ISO string
};

export type ProductDetail = ProductListItem & {
  // alleen op detail endpoint
  descriptions?: Partial<Record<LanguageCode, string>>;
  longDescription?: Partial<Record<LanguageCode, string>>;

  images?: ProductImagesDetail;

  attributes?: Record<string, string | number | boolean | null>;
};
