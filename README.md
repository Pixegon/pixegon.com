# Pixegon Website

This repository contains the static Astro implementation of the Pixegon marketing website. It preserves the original Claude Design UI, responsive layout, Canvas scene, scroll-linked motion, reveals, and interactive states while rendering the complete page as indexable HTML.

The original artifact remains in [`Pixegon (4).html`](./Pixegon%20%284%29.html) as the visual and behavioral reference. React is not used at runtime.

## Project characteristics

- Astro static output (`output: "static"`).
- Complete HTML and SEO metadata are rendered at build time.
- No server-side rendering adapter is required.
- No production Node.js process is required after the build.
- No environment variables are currently required.
- The deployable output is generated in `dist/`.
- The site is currently configured for the domain root at `https://pixegon.com/`.

## Requirements

- Node.js 24.1.0, as declared in [`.nvmrc`](./.nvmrc).
- The compatible Node.js ranges are also declared in [`package.json`](./package.json).
- npm, using the committed [`package-lock.json`](./package-lock.json).

With `nvm` installed:

```sh
nvm install
nvm use
npm ci
```

Use `npm ci` instead of `npm install` in CI and deployment environments so the committed dependency versions are installed exactly.

## Run locally

Install dependencies and start the development server:

```sh
npm ci
npm run dev
```

Open [http://localhost:4321](http://localhost:4321). Astro provides hot module replacement while the server is running.

To expose the development server to another device on the same network:

```sh
npm run dev -- --host 0.0.0.0
```

The development server is for local work only. Stop it with `Ctrl+C` in a standard terminal.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Astro development server with hot module replacement. |
| `npm run check` | Run Astro and TypeScript diagnostics. |
| `npm run extract` | Regenerate the static Astro markup and CSS from the original artifact. |
| `npm run build` | Run diagnostics and generate the production build in `dist/`. |
| `npm run preview` | Serve the generated `dist/` build locally for a production smoke test. |
| `npm run verify` | Build the site and verify SEO, static content, fonts, local assets, and the absence of React or artifact syntax. |

## Production build and preview

Run the complete release verification:

```sh
npm run verify
```

Then preview the exact production output:

```sh
npm run preview
```

The preview server normally uses [http://localhost:4321](http://localhost:4321). If that port is occupied, Astro will select another available port and print it in the terminal.

`npm run preview` is a verification tool, not a production server. Production hosting should publish the static contents of `dist/` through a CDN or web server.

## Deployment

This project can be deployed to any static hosting provider. Use these settings when importing the repository:

| Setting | Value |
| --- | --- |
| Runtime | Node.js `24.1.0` |
| Install command | `npm ci` |
| Build command | `npm run verify` |
| Publish/output directory | `dist` |
| Framework preset | Astro, when requested |
| Serverless or SSR adapter | None |
| Environment variables | None currently |

The build command can be changed to `npm run build` if a provider does not allow custom verification commands, although `npm run verify` is the recommended release gate.

### Vercel, Netlify, or Cloudflare Pages

1. Push the project to a Git repository.
2. Import the repository in the hosting dashboard.
3. Apply the settings from the table above.
4. Configure Node.js 24.1.0 in the project settings.
5. Deploy the production branch.
6. Attach `pixegon.com`, configure HTTPS, and choose whether the apex domain or `www` is canonical.

Static Astro projects do not require an adapter on these platforms. See the official [Astro deployment guide](https://docs.astro.build/en/guides/deploy/), [Vercel Astro guide](https://vercel.com/docs/frameworks/frontend/astro), [Netlify Astro guide](https://docs.astro.build/en/guides/deploy/netlify/), or [Cloudflare Pages Astro guide](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/) for provider-specific dashboard details.

### Traditional server, Nginx, Apache, S3, or another static host

Build and verify locally or in CI:

```sh
npm ci
npm run verify
```

Upload the **contents** of `dist/` to the website document root. The deployed root must contain `index.html`, `robots.txt`, `sitemap.xml`, `favicon.svg`, `fonts/`, and `_astro/`.

A minimal Nginx location setup looks like this:

```nginx
root /var/www/pixegon;
index index.html;

location / {
    try_files $uri $uri/ =404;
}

location /_astro/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

Configure TLS, compression, the apex/`www` redirect, and security headers at the CDN or web-server layer. A single-page-application rewrite to `index.html` is not required.

## Domain and SEO configuration

The production domain is currently present in several files:

- [`astro.config.mjs`](./astro.config.mjs) for canonical URL generation.
- [`src/layouts/BaseLayout.astro`](./src/layouts/BaseLayout.astro) for structured data and metadata.
- [`public/robots.txt`](./public/robots.txt) for the sitemap location.
- [`public/sitemap.xml`](./public/sitemap.xml) for the indexed URL.

Update all four locations if the production domain changes. Preview or staging deployments should be protected from indexing through the hosting platform or an appropriate `noindex` policy.

The current build assumes deployment at the domain root because assets use root-relative URLs such as `/fonts/`, `/favicon.svg`, and `/_astro/`. A subdirectory deployment requires an Astro `base` configuration and a review of all root-relative asset URLs.

## Updating the site

The following files are generated and must not be edited directly:

- [`src/components/SiteMarkup.astro`](./src/components/SiteMarkup.astro)
- [`src/styles/site.css`](./src/styles/site.css)

Durable markup or generated-style changes must be made in the original artifact and/or [`scripts/extract-artifact.mjs`](./scripts/extract-artifact.mjs), followed by:

```sh
npm run extract
npm run verify
```

Running `npm run extract` overwrites both generated files.

Use these manual source files for their respective responsibilities:

- [`src/layouts/BaseLayout.astro`](./src/layouts/BaseLayout.astro): document structure, metadata, canonical URL, and JSON-LD.
- [`src/pages/index.astro`](./src/pages/index.astro): page composition and controller initialization.
- [`src/scripts/site-controller.ts`](./src/scripts/site-controller.ts): scroll effects, responsive behavior, menu, stack tabs, and form state.
- [`src/scripts/laptop-scene.ts`](./src/scripts/laptop-scene.ts): procedural Canvas laptop scene.
- [`src/styles/fonts.css`](./src/styles/fonts.css): local font-face declarations.
- [`public/fonts/`](./public/fonts/): self-hosted font files.

## Contact form limitation

The current contact form validates fields in the browser and displays the success state, but it does **not** send or persist submissions. Integrate a backend endpoint or form provider before relying on it for production leads.

When an endpoint is added, preserve the current validation and success/error UI, keep secrets on the server or hosting platform, and never expose private API keys in client-side code.

## Release checklist

Before every production deployment:

1. Run `npm ci` in a clean environment.
2. Run `npm run verify` and resolve every diagnostic or verification failure.
3. Run `npm run preview` and perform a production smoke test.
4. Check the hero Canvas and initial motion on desktop and mobile.
5. Check the horizontal Services scroll sequence.
6. Check reveals, parallax, About story motion, and the Contact iris transition.
7. Check all six Stack tabs, the mobile menu, and the contact-form states.
8. Check reduced-motion behavior.
9. Confirm the canonical URL, `robots.txt`, `sitemap.xml`, favicon, fonts, and browser console.
10. Publish `dist/`, verify HTTPS, and test the live domain.

The automated verifier checks the static build and assets, but browser motion and responsive visual parity still require a smoke test after animation or layout changes.

## Architecture

- Astro renders the complete page and SEO metadata as static HTML.
- `scripts/extract-artifact.mjs` converts the original artifact into stable Astro markup and CSS.
- `site-controller.ts` owns the client-side motion and small interactive states.
- `laptop-scene.ts` owns the procedural Canvas 2D hero.
- The original geometry and `data-px` hooks are intentionally preserved for motion parity.
- Self-hosted font subsets are served from `public/fonts`.
- The production JavaScript bundle contains only the interaction and animation runtime required by the page.
