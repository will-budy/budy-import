# OB Platform Wiki

This repository is the central docs-as-code workspace for Budy's platform context, service architecture, infrastructure context, and operating knowledge.

The source of truth stays in Markdown under `design_docs/`. A lightweight MkDocs site is layered on top so the same content can be browsed in an editor or in a browser with navigation and search.

## Repository Conventions

- Keep one canonical page per platform area or service and link outward from there.
- Update docs in the same PR as the code or infra change that introduced the behavior.
- Use frontmatter consistently for owner, status, version, and `last_updated`.
- Move retired material to `design_docs/archive/` instead of deleting decision history.

## Browse Locally

```bash
python3 -m pip install -r requirements-docs.txt
mkdocs serve
```

MkDocs reads from `design_docs/` and serves a browsable site with left-side navigation and search.

## Quality Checks

GitHub Actions runs:

- Markdown linting
- Markdown link validation
- Strict MkDocs build validation

The workflow lives at `.github/workflows/docs-quality.yml`.
