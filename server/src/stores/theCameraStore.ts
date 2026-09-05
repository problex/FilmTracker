import { createShopifyAdapter } from "./shopify.js";

/**
 * The Camera Store runs Shopify, so it gets the shared adapter and its bulk
 * catalogue mode. The previous bespoke JSON-LD/HTML scraper searched once per film
 * and consistently overran the per-store budget, truncating the catalogue at
 * roughly film 10 of 30.
 */
export const theCameraStoreAdapter = createShopifyAdapter({
  storeId: "the-camera-store",
  storeName: "The Camera Store",
  baseUrl: "https://thecamerastore.com",
});
