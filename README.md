# OwEn Blog

Personal blog source for [owen.top](https://owen.top/).

This repository is no longer a generic template showcase. It is the actual source code of my blog, built with Astro and customized around four long-term content areas:

- `Study`: study notes, algorithm writeups, Python / LLM / FastAPI / PyTorch learning records
- `Lab`: experiments, demos, and interactive prototypes
- `Lounge`: lighter personal writing, reviews, and life fragments
- `Archive`: collected links, resources, and structured references

## Project Structure

Main content lives here:

- `src/content/posts/study/`
- `src/content/posts/lab/`
- `src/content/posts/lounge/`
- `src/content/posts/archive/`

Important project files:

- [src/config.ts](/Users/owen/mizuki/src/config.ts): site config
- [src/data/module-blueprint.ts](/Users/owen/mizuki/src/data/module-blueprint.ts): module copy and shared module metadata
- [src/styles/main.css](/Users/owen/mizuki/src/styles/main.css): global styles
- [docs/STUDY_WRITE_GUIDE.zh-CN.md](/Users/owen/mizuki/docs/STUDY_WRITE_GUIDE.zh-CN.md): Study writing guide
- [docs/MODULE_DIRECTORY_AND_PYTHON_GUIDE.zh-CN.md](/Users/owen/mizuki/docs/MODULE_DIRECTORY_AND_PYTHON_GUIDE.zh-CN.md): directory modules and runnable Python blocks

## Local Development

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm check
pnpm build
pnpm preview
```

## Deployment

The production site is deployed through Vercel and updated by pushing to the `main` branch.

If I need to re-check the deployment setup, the internal notes are here:

- [docs/VERCEL_OWEN_TOP_DEPLOY.zh-CN.md](/Users/owen/mizuki/docs/VERCEL_OWEN_TOP_DEPLOY.zh-CN.md)

## Acknowledgement

This project started from the open-source [Mizuki](https://github.com/matsuzaka-yuki/mizuki) blog project and has since been heavily reworked for my own use.
