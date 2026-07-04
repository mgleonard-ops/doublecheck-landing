# doublecheck-landing

Static site (mydoublecheck.app), deployed via Vercel.

## Workflow
- Direct-to-master is the norm for fast solo iteration. Feature branches + PRs for larger/riskier changes.
- git remote must be SSH (`git@github.com:mgleonard-ops/doublecheck-landing`).
- Root of the site (`/`) never opens the app — deep links must go through `/app` or store/write-review links. CTAs in emails/notifications must point at those, not the bare domain.

## SEO automation (all cloud, laptop-independent)
- 3 GitHub Actions: technical SEO linter, weekly GSC performance digest, Tuesday auto-fix (opens fix PRs via claude-code-action).
- GH Actions schedules auto-disable after 60 days with no commits to the repo — if the weekly digest/auto-fix silently stop, check for that first.
- GSC access is via a read-only `gsc-reader` service account (project `doublecheck-495212`).
- Cloudflare zone ID for mydoublecheck.app: `559fdd6bab71d83b52cbe84844e8276c`. Use an API token supplied at the time — never store tokens here.

## Deploys
- Vercel CLI is authenticated as `martingleonard-4590s-projects`; pushes to master auto-deploy.
