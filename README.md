# skills

Agent Skills for Claude Code, vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
(MIT, © Leonxlnx) at commit `ccbc156` (2026-08-24).

Thirteen frontend design / "anti-slop" skills, plus the research notes behind the
output-enforcement skill. Upstream's README assets, sponsor images, and build
scripts are not vendored — only the skills themselves.

## Skills

| Directory | Skill name | What it does |
| --- | --- | --- |
| `skills/taste-skill` | `design-taste-frontend` | Default design skill (v2, experimental). Reads the brief, infers a design language, tunes VARIANCE / MOTION / DENSITY, ships non-templated landing pages, portfolios, redesigns. |
| `skills/taste-skill-v1` | `design-taste-frontend-v1` | The original v1, kept for exact backward compatibility. |
| `skills/gpt-tasteskill` | `gpt-taste` | Awwwards-level frontend + GSAP motion engineering, deterministic anti-slop output. |
| `skills/image-to-code-skill` | `image-to-code` | Generates design reference images first, analyzes them, then implements matching code. |
| `skills/imagegen-frontend-web` | `imagegen-frontend-web` | Image generation only — one horizontal reference image per website section. |
| `skills/imagegen-frontend-mobile` | `imagegen-frontend-mobile` | Image generation only — premium mobile screen concepts and flows. |
| `skills/brandkit` | `brandkit` | Image generation only — brand-kit boards, logo systems, palettes, typography, mockups. |
| `skills/redesign-skill` | `redesign-existing-projects` | Audits an existing project and upgrades its design without breaking behavior. |
| `skills/soft-skill` | `high-end-visual-design` | Expensive, soft UI: premium fonts, whitespace, depth, smooth motion. |
| `skills/minimalist-skill` | `minimalist-ui` | Editorial Notion/Linear-style minimalism, warm monochrome, flat bento grids. |
| `skills/brutalist-skill` | `industrial-brutalist-ui` | Swiss typography meets military terminal; rigid grids, extreme scale contrast. (Beta) |
| `skills/stitch-skill` | `stitch-design-taste` | Emits `DESIGN.md` files in Google Stitch's semantic design language. |
| `skills/output-skill` | `full-output-enforcement` | Bans truncation and placeholder comments; forces complete code output. |

Note that directory names and skill `name:` fields differ for several skills — the
`name:` in the frontmatter is what you invoke. `skills/llms.txt` carries upstream's
one-line summary of each.

## Two copies, on purpose

| Path | Purpose | Directory names |
| --- | --- | --- |
| `skills/` | The source of truth, and the plugin-marketplace layout. | Upstream's (`brutalist-skill/`, …) |
| `.claude/skills/` | Auto-loaded in any Claude Code session opened in this repo. | Each skill's `name:` field (`industrial-brutalist-ui/`, …) |

`.claude/skills/` is generated. After editing anything under `skills/`, run:

```
./scripts/sync-local-skills.sh
```

## Using them

Working inside this repo: nothing to do — the skills in `.claude/skills/` load
automatically.

From any other project, install this repo as a plugin marketplace (requires the
content to be on the default branch):

```
/plugin marketplace add Echo844883/skills
/plugin install taste-skill@taste-skill
```

For every project on a machine, copy the skill directories you want into
`~/.claude/skills/`.

## Updating from upstream

Re-copy `skills/`, `research/`, `.claude-plugin/`, `LICENSE`, and `CHANGELOG.md`
from a fresh clone of upstream, run `./scripts/sync-local-skills.sh`, and bump the
commit noted at the top of this file.

## License

MIT — see [`LICENSE`](LICENSE). Copyright © 2026 Leonxlnx.
