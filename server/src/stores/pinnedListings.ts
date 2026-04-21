export type PinnedListing = {
  storeId: string;
  filmId: string;
  url: string;
};

// Pinned listings are scraped by exact URL (useful for stores where search is blocked).
export const pinnedListings: PinnedListing[] = [
  {
    storeId: "downtown-camera",
    filmId: "kentmere-pan-400",
    url: "https://downtowncamera.com/shop/kentmere-400-iso-135-black-and-white-36-exp-6010476/59c640a0-29bb-0138-89e2-00163ecd2826?variation=2121149",
  },
];

