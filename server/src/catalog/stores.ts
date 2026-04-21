export type StoreSeed = {
  id: string;
  name: string;
  province: string;
  baseUrl: string | null;
};

export const storeSeeds: StoreSeed[] = [
  { id: "aden-camera", name: "Aden Camera", province: "ON", baseUrl: "https://www.adencamera.com" },
  { id: "beau-photo", name: "Beau Photo", province: "BC", baseUrl: "https://www.beauphoto.com" },
  { id: "dons-photo", name: "Dons Photo", province: "CA", baseUrl: "https://donsphoto.com" },
  { id: "downtown-camera", name: "DowntownCamera", province: "ON", baseUrl: "https://downtowncamera.com" },
  { id: "grainanation", name: "Graination", province: "ON", baseUrl: "https://graination.ca" },
  { id: "kerrisdale", name: "Kerrisdale Cameras", province: "BC", baseUrl: "https://kerrisdalecameras.com" },
  { id: "lord-photo", name: "Lord Photo", province: "QC", baseUrl: "https://lordphoto.ca" },
  { id: "popho", name: "Popho Camera", province: "QC", baseUrl: "https://popho.ca" },
  { id: "studio-argentique", name: "Studio Argentique", province: "QC", baseUrl: "https://studioargentique.ca" },
  { id: "the-camera-store", name: "The Camera Store", province: "AB", baseUrl: "https://thecamerastore.com" }
];

