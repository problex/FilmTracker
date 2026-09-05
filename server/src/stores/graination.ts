import { createWooStoreApiAdapter } from "./wooStoreApi.js";

/**
 * Graination runs WooCommerce. The previous HTML-scraping adapter stopped matching
 * and returned zero listings; the Store API exposes the whole catalogue with
 * structured prices and stock, so use that instead.
 */
export const grainationAdapter = createWooStoreApiAdapter({
  storeId: "grainanation",
  storeName: "Graination",
  baseUrl: "https://graination.ca",
});
