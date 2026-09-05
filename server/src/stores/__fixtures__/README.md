# Adapter fixtures

Saved responses from the live stores, trimmed to the products that exercise the
behaviour worth pinning. Scrapers fail silently — a broken selector returns zero rows,
which looks the same as a store having no stock — so these are the only reliable signal
that an adapter still works.

Each fixture was chosen to contain an awkward case:

| Fixture | Contains |
|---|---|
| `shopify-popho.json` | the same film in 120 and 35mm; prices as dollar strings (`"16.99"`), which `/products/<handle>.js` returns as cents |
| `woo-filmwarehouse.json` | a 4x5 sheet listing, a 120 listing, a `3pk` multipack marked `Exp 12/2026`, and titles that omit the format entirely |
| `woo-beauphoto.json` | two *variable* products whose parent carries only a price range |
| `woo-beauphoto-variations.json` | the 35mm variations those parents point at, keyed by id — a 36exp roll and a 100ft bulk roll at very different prices |

## Refreshing

Only needed when a store changes the shape of its responses. Re-running these
overwrites the awkward cases above, so check the tests still cover them afterwards.

```bash
UA="Mozilla/5.0 (compatible; FilmTracker/0.1; price tracker)"

curl -sSL -A "$UA" "https://popho.ca/collections/all/products.json?limit=250" \
 | jq '{products: [.products[] | select(.title|test("portra|gold 200|hp5|cinestill 800|kentmere";"i"))][:6]}' \
 > shopify-popho.json

curl -sSL -A "$UA" "https://filmwarehouse.ca/wp-json/wc/store/v1/products?per_page=100" \
 | jq '[.[] | select(.name|test("gold 200|hp5|kentmere pan|ultramax";"i"))][:6]' \
 > woo-filmwarehouse.json

curl -sSL -A "$UA" "https://www.beauphoto.com/wp-json/wc/store/v1/products?per_page=100&search=ilford" \
 | jq '[.[] | select(.name|test("hp5|delta 400";"i"))][:2]' \
 > woo-beauphoto.json
```

`woo-beauphoto-variations.json` is a map of variation id to payload, built by fetching
`/wp-json/wc/store/v1/products/<id>` for each 35mm variation listed in
`woo-beauphoto.json`.
