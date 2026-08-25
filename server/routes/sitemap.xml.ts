import { eq } from "drizzle-orm";
import { useDb, schema } from "~~/server/utils/db";
import { publicUrls } from "~~/server/utils/urls";

export default defineEventHandler(async (event) => {
  const { site } = publicUrls(event);

  const rows = await useDb(event)
    .select({ slug: schema.restrooms.slug, isoDate: schema.restrooms.isoDate })
    .from(schema.restrooms)
    .where(eq(schema.restrooms.status, "published"))
    .all();

  const staticUrls = ["/", "/about"].map((path) => {
    return `  <url>\n    <loc>${site}${path}</loc>\n  </url>`;
  });

  const restroomUrls = rows.map((r) => {
    const lastmod = r.isoDate ? `\n    <lastmod>${r.isoDate}</lastmod>` : "";
    return `  <url>\n    <loc>${site}/r/${r.slug}</loc>${lastmod}\n  </url>`;
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...restroomUrls,
    "</urlset>",
  ].join("\n");

  setHeader(event, "Content-Type", "application/xml; charset=utf-8");
  return xml;
});
