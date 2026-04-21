import { closeBrowser, withPage, extractRenderedText } from "../stores/dakisBrowser.js";

async function main() {
  const shopUrl = new URL("/shop", "https://kerrisdalecameras.com");
  shopUrl.searchParams.set("query", "portra 160 135");

  await withPage(async (page) => {
    await page.goto(shopUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    const url = page.url();
    const text = await extractRenderedText(page);
    const links = await page.$$eval("a[href]", (as) =>
      (as as any[])
        .map((a) => (a as any).href as string)
        .filter((h) => typeof h === "string" && h.includes("/shop/"))
        .slice(0, 12)
    );

    console.log(
      JSON.stringify(
        {
          url,
          title,
          head: text.slice(0, 800),
          links,
        },
        null,
        2
      )
    );
  });

  await closeBrowser().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

