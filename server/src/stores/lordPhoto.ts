import { createDakisShopAdapter } from "./dakisShop.js";

export const lordPhotoAdapter = createDakisShopAdapter({
  storeId: "lord-photo",
  storeName: "Lord Photo",
  baseUrl: "https://lordphoto.ca",
  shopPath: "/en/shop",
});

