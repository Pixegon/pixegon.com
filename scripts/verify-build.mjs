import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const htmlPath = resolve(root, "dist/index.html");
const html = await readFile(htmlPath, "utf8");

const requiredPatterns = [
  ["English language declaration", /<html\s+lang="en"/i],
  ["page title", /<title>Pixegon — Custom Software Development/i],
  ["meta description", /<meta\s+name="description"/i],
  ["canonical URL", /<link\s+rel="canonical"\s+href="https:\/\/pixegon\.com\/?"/i],
  ["primary heading", /<h1[^>]*>[\s\S]*?We Build Software/i],
  ["services section", /id="services"/i],
  ["technology section", /id="stack"/i],
  ["about section", /id="about"/i],
  ["contact section", /id="contact"/i],
  ["structured data", /application\/ld\+json/i],
];

const forbiddenPatterns = [
  ["artifact loader", /__bundler/],
  ["Claude Design conditional", /<sc-if\b/i],
  ["Claude Design loop", /<sc-for\b/i],
  ["unresolved interpolation", /\{\{[^}]+\}\}/],
  ["React runtime", /react-dom|ReactDOM|unpkg\.com\/react/i],
];

const failures = [];

for (const [label, pattern] of requiredPatterns) {
  if (!pattern.test(html)) failures.push(`Missing ${label}.`);
}

for (const [label, pattern] of forbiddenPatterns) {
  if (pattern.test(html)) failures.push(`Unexpected ${label}.`);
}

const requiredBuildAssets = [
  "dist/robots.txt",
  "dist/sitemap.xml",
  "dist/favicon.svg",
];

const fontFiles = (await readdir(resolve(root, "public/fonts")))
  .filter((file) => file.endsWith(".woff2"))
  .sort();

requiredBuildAssets.push(
  ...fontFiles.map((file) => `dist/fonts/${file}`),
);

for (const relativePath of requiredBuildAssets) {
  try {
    await access(resolve(root, relativePath));
  } catch {
    failures.push(`Missing build asset: ${relativePath}.`);
  }
}

const astroDirectory = resolve(root, "dist/_astro");
const astroFiles = await readdir(astroDirectory);
const stylesheetFiles = astroFiles.filter((file) => file.endsWith(".css"));
const builtCss = (
  await Promise.all(
    stylesheetFiles.map((file) => readFile(resolve(astroDirectory, file), "utf8")),
  )
).join("\n");

for (const fontFile of fontFiles) {
  if (!builtCss.includes(`/fonts/${fontFile}`)) {
    failures.push(`Font is not referenced by the emitted CSS: ${fontFile}.`);
  }
}

const localAssetReferences = new Set(
  [...`${html}\n${builtCss}`.matchAll(/["'(](\/(?:_astro|fonts)\/[^"')?#]+)/g)]
    .map((match) => match[1]),
);

for (const assetReference of localAssetReferences) {
  try {
    await access(resolve(root, "dist", assetReference.slice(1)));
  } catch {
    failures.push(`Broken emitted asset reference: ${assetReference}.`);
  }
}

if (failures.length > 0) {
  console.error("Build verification failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Build verification passed: static content, SEO metadata, and local assets are present.");
}
