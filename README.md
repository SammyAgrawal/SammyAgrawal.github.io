# Sammy Personal Website
Built scaffold using Astro.

SammyAgrawal.github.io/
└── site/                         # THIS is the live Astro project
    ├── astro.config.mjs
    ├── package.json
    └── src/
        ├── components/           # Header, Footer, BaseHead, FormattedDate, HeaderLink
        ├── layouts/
        │   └── BlogPost.astro    # shared layout for /writing posts AND /notes detail pages
        ├── pages/                # routes (file-based)
        ├── content/              # markdown content (collections)
        ├── content.config.ts     # defines `writing`, `notes`, `projects` collections
        └── consts.ts             # SITE_TITLE, SITE_DESCRIPTION