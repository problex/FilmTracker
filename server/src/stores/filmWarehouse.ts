import { createWooStoreApiAdapter, type WooProduct } from "./wooStoreApi.js";

/**
 * FilmWarehouse (Great Canadian Film Warehouse) — WooCommerce Store API.
 *
 * Neither signal is reliable on its own here:
 *  - many titles omit the format ("Kodak Gold 200 24exp 3 pack"), which is exactly
 *    where the multipacks live, so a title-only test drops them;
 *  - the categories contradict the titles in both directions — "Kodak Ektacolor 400
 *    35mm 36exp" is filed under 120, and "ILFORD FP4 plus 120" under 35mm.
 *
 * So the title wins whenever it names a format, and the category is only consulted
 * when the title is silent.
 */

const NON_35MM_RX = /\b(120|220|110|126|127|4\s?x\s?5|8\s?x\s?10|super\s?8|16\s?mm|instax)\b/i;
const IS_35MM_RX = /\b(35\s?mm|135)\b/i;

function inCategory(p: WooProduct, name: string) {
  return (p.categories ?? []).some((c) => (c.name ?? "").trim().toLowerCase() === name);
}

function is35mm(p: WooProduct, title: string) {
  if (NON_35MM_RX.test(title)) return false;
  if (IS_35MM_RX.test(title)) return true;
  return inCategory(p, "35mm");
}

export const filmWarehouseAdapter = createWooStoreApiAdapter({
  storeId: "film-warehouse",
  storeName: "FilmWarehouse",
  baseUrl: "https://filmwarehouse.ca",
  is35mm,
  // ~232 products.
  maxPages: 6,
});
