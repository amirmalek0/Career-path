# Mastery Learning Dashboard

A shared learning dashboard for Amirs and Amir Khan, focused on database internals, distributed systems, software architecture, Go, Docker/CI/CD, and algorithms.

## Persistence

- `public/data/resources.json` is the source of truth for resources, calendar overrides, and progress.
- Uploaded PDFs are committed under `public/uploads/`.
- The deployed dashboard stores no application data in browser storage.
- To edit from the deployed dashboard, connect a fine-grained GitHub token with **Contents: Read and write** permission for this repository. The token remains only in memory for the current tab.

## Deployment

Pushes to `master`, including dashboard-authored data commits, are built and deployed automatically to GitHub Pages by `.github/workflows/deploy-pages.yml`.

## Development

```bash
npm ci
npm run dev
```

Validate the GitHub Pages export with:

```bash
GITHUB_ACTIONS=true GITHUB_REPOSITORY=amirmalek0/Career-path npm run build:pages
```
