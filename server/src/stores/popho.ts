import { createShopifyAdapter } from "./shopify.js";

export const pophoAdapter = createShopifyAdapter({
  storeId: "popho",
  storeName: "Popho Camera",
  baseUrl: "https://popho.ca",
});

