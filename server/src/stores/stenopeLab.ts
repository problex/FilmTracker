import { createShopifyAdapter } from "./shopify.js";

/**
 * Sténopé Lab (Montréal). Shopify, with French product titles:
 * "Film couleur Kodak Eastman Gold 200 (35mm, 36 poses)", "Pack 3",
 * "paquet de 5", "Expiré 09/2024". The shared parsers handle those forms.
 */
export const stenopeLabAdapter = createShopifyAdapter({
  storeId: "stenope-lab",
  storeName: "Sténopé Lab",
  baseUrl: "https://stenopelab.com",
});
