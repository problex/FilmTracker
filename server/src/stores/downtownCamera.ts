import { createDakisShopAdapter } from "./dakisShop.js";

export const downtownCameraAdapter = createDakisShopAdapter({
  storeId: "downtown-camera",
  storeName: "DowntownCamera",
  baseUrl: "https://downtowncamera.com",
});

