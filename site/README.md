# Astro Starter Kit: Blog

```sh
npm create astro@latest -- --template blog
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and Open Graph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

The `src/content/` directory contains "collections" of related Markdown and MDX documents. Use `getCollection()` to retrieve posts from `src/content/blog/`, and type-check your frontmatter using an optional schema. See [Astro's Content Collections docs](https://docs.astro.build/en/guides/content-collections/) to learn more.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 📥 Importing notes from Notion

Notion's **Markdown** export is lossy — it flattens toggles, columns, and callouts
(plain markdown can't express them). Notion's **HTML** export keeps them, so it's the
source we convert from.

`scripts/notion-to-mdx.mjs` (zero dependencies, pure Node) turns a Notion HTML export
into an Astro `.mdx` note that uses the components in `src/components/notion/`:

- Notion toggle (▸ dropdown) → `<Toggle summary="…">`
- Notion columns → `<Columns cols={n}><Column>…</Column></Columns>`
- Notion callout → `<Callout emoji="…">`

### How to export from Notion

Open the page → `•••` menu → **Export** → Format: **HTML**, Include content: **Everything**.
Unzip it; the page's `.html` file is your input.

### How to run

Run from `site/`. The HTML file is the **first argument**:

```sh
node scripts/notion-to-mdx.mjs <export.html> [options]
```

Typical note import:

```sh
node scripts/notion-to-mdx.mjs "path/to/Notion Export.html" \
  --topic=economics --slug=against-platforms --date=2025-05-23 \
  --tags=prosperity-project
```

Add `--stdout` to preview the MDX without writing a file.

| Option           | Default                                    | Notes                                             |
| :--------------- | :----------------------------------------- | :------------------------------------------------ |
| `--out=`         | `src/content/<collection>/<topic>/<slug>.mdx` | Explicit output path                           |
| `--collection=`  | `notes`                                    | `notes` \| `writing` \| `projects`                |
| `--topic=`       | parent dir of `--out`, else `misc`         | notes only                                        |
| `--slug=`        | slugified title                            | filename / URL slug                               |
| `--title=`       | Notion page title                          | override                                          |
| `--description=` | first paragraph                            | override                                          |
| `--date=`        | today                                      | **Notion HTML carries no date — set this**        |
| `--tags=`        | none                                       | comma-separated; must match files in `content/tags/` |
| `--hero=`        | topic stock photo (if known)              | heroImage path                                    |
| `--stdout`       | —                                          | print instead of writing                          |

### Notes / caveats

- **Column ratios are dropped** — columns render equal-width and stack on mobile.
- **Toggles default to closed** (that's the point of a toggle). Add `open` in the MDX
  to expand one by default.
- **Don't leave raw exports under `src/content/`** — the collection globs `**/*.{md,mdx}`,
  so a stray frontmatter-less `.md` will break `npm run build`. Keep `.html`/`.zip` exports
  elsewhere (or delete after converting).
- After importing, run `npm run build` to catch any schema errors, then click through the
  note in `npm run dev`.

## 👀 Want to learn more?

Check out [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
