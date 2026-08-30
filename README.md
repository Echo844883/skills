# skills

48 Agent Skills for Claude Code, vendored from three upstream projects.

| Collection | Upstream | Vendored at | Skills | What it covers |
| --- | --- | --- | --- | --- |
| taste-skill | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, © Leonxlnx) | `ccbc156`, 2026-08-24 | 13 | Frontend design taste, "anti-slop" UI, image generation |
| superpowers | [obra/superpowers](https://github.com/obra/superpowers) v6.3.0 (MIT, © Jesse Vincent) | `b36e082`, 2026-08-12 | 14 | Engineering workflow: TDD, debugging, planning, code review |
| baoyu-skills | [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills) v2.5.2 (MIT, © Jim Liu 宝玉) | `6b7a2e4`, 2026-07-03 | 21 | Content production and publishing — **most need `bun` plus credentials** |

## Tools

| Path | What it is |
| --- | --- |
| [`probability-weight-calculator/`](./probability-weight-calculator) | Static web app: pick a goal (考研 / 保研 / 就业), weigh the things you're evaluating (CET, GPA, competitions, internships, …), and get a weighted success-probability estimate. Pure client-side, no backend, no API key. Live at [echo844883.github.io/skills/probability-weight-calculator/](https://echo844883.github.io/skills/probability-weight-calculator/) once GitHub Pages is enabled (see `.github/workflows/deploy-probability-weight-calculator.yml`). |

## taste-skill

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

Directory names and skill `name:` fields differ for several of these — the `name:`
in the frontmatter is what you invoke. `skills/llms.txt` carries upstream's
one-line summary of each.

Upstream's README assets, sponsor images, and build scripts are not vendored.

## superpowers

Lives under `vendor/superpowers/`, kept in upstream's full layout so its hooks and
scripts stay coherent.

| Skill | What it does |
| --- | --- |
| `brainstorming` | Explores intent and requirements before any creative work. |
| `writing-plans` | Turns a spec into a written implementation plan. |
| `executing-plans` | Executes a written plan with review checkpoints. |
| `subagent-driven-development` | Runs independent plan tasks in the current session. |
| `dispatching-parallel-agents` | Fans out 2+ independent tasks with no shared state. |
| `test-driven-development` | Tests before implementation, every feature and bugfix. |
| `systematic-debugging` | Root-cause discipline for any bug or test failure. |
| `requesting-code-review` | Verifies work against requirements before merging. |
| `receiving-code-review` | Handles review feedback with verification, not agreement. |
| `verification-before-completion` | Evidence before any "it's done" claim. |
| `using-git-worktrees` | Isolated workspaces for feature work. |
| `finishing-a-development-branch` | Decides how to integrate completed work. |
| `using-superpowers` | Upstream's session-start primer on finding and using skills. |
| `writing-skills` | Creating, editing, and verifying skills. |

**The upstream SessionStart hook is not active here.** Upstream ships
`vendor/superpowers/hooks/`, which injects `using-superpowers` into every session
and requires a skill invocation before any reply. Vendored this way the hook never
runs — the skills are available on demand instead. Install the upstream plugin
directly (`/plugin marketplace add obra/superpowers`) if you want that behavior.

## baoyu-skills

Lives under `vendor/baoyu-skills/`. Content production aimed at Chinese-language
publishing.

| Skill | What it does | Needs |
| --- | --- | --- |
| `baoyu-diagram` | Dark-themed SVG diagrams: architecture, flowchart, sequence. | — |
| `baoyu-infographic` | Infographics; 21 layouts × 22 visual styles. | — |
| `baoyu-cover-image` | Article cover images across 5 design dimensions. | — |
| `baoyu-article-illustrator` | Finds where an article needs visuals, then makes them. | — |
| `baoyu-xhs-images` | 小红书 image-card series; 12 styles, 8 layouts. | — |
| `baoyu-comic` | Educational comics in several art styles. | bun |
| `baoyu-slide-deck` | Slide-deck images from an outline. | bun |
| `baoyu-image-gen` | Image generation across GPT Image 2, Azure, Google, OpenRouter, DashScope, GLM, MiniMax. | bun + provider key |
| `baoyu-translate` | Translation. | bun |
| `baoyu-format-markdown` | Formats text into structured markdown with frontmatter. | bun |
| `baoyu-markdown-to-html` | Markdown → styled HTML with WeChat-compatible themes. | bun |
| `baoyu-url-to-markdown` | Any URL → markdown via `baoyu-fetch` (Chrome CDP). | bun |
| `baoyu-youtube-transcript` | YouTube transcripts and cover images. | bun |
| `baoyu-compress-image` | Compresses images to WebP or PNG. | bun |
| `baoyu-electron-extract` | Unpacks `.asar` bundles from installed Electron apps. | bun |
| `baoyu-post-to-wechat` | Posts to 微信公众号 via API or Chrome CDP. | bun + account |
| `baoyu-post-to-weibo` | Posts to 微博, including headline articles. | bun + account |
| `baoyu-post-to-x` | Posts to X, including X Articles. | bun + account |
| `baoyu-wechat-summary` | Digests WeChat group chats. | `wx-cli` binary |
| `baoyu-danger-gemini-web` | Text and image generation through Gemini's web API. | bun + **see below** |
| `baoyu-danger-x-to-markdown` | X posts and articles → markdown. | bun + **see below** |

### Before using these

- **`bun` is the main dependency.** Most skills shell out to CLIs run through
  `bun`/`npx`. `baoyu-fetch`, `baoyu-md`, and `baoyu-chrome-cdp` are published on
  npm, so `npx` fetches them on demand.
- **`packages/baoyu-codex-imagegen` is vendored** because it is *not* published on
  npm and some skills locate it by walking up to the plugin root. Upstream's other
  three packages are not vendored — npm serves them.
- **The two `baoyu-danger-*` skills use reverse-engineered private APIs** (Gemini
  Web, X) and need your own logged-in session. Upstream names them "danger" for a
  reason: they can break without warning, and they likely violate those services'
  terms. Delete them from `.claude/skills/` if you would rather not have them
  available.
- **The posting skills act on your real accounts.** `baoyu-post-to-*` publish to
  live 公众号 / 微博 / X once credentials are configured.

## Two copies, on purpose

| Path | Purpose | Directory names |
| --- | --- | --- |
| `skills/` | taste-skill source, and the root plugin's layout. | Upstream's (`brutalist-skill/`, …) |
| `vendor/superpowers/` | superpowers source, full upstream layout. | Upstream's |
| `vendor/baoyu-skills/` | baoyu-skills source. | Upstream's |
| `.claude/skills/` | All 48, auto-loaded in any session opened in this repo. | Each skill's `name:` field (`industrial-brutalist-ui/`, …) |

`.claude/skills/` is generated. After editing either source tree, run:

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
/plugin install taste-skill@echo-skills
/plugin install superpowers@echo-skills
/plugin install baoyu-skills@echo-skills
```

For every project on a machine, copy the skill directories you want into
`~/.claude/skills/`.

## Updating from upstream

- **taste-skill** — re-copy `skills/`, `research/`, `LICENSE`, and `CHANGELOG.md`
  from a fresh clone of upstream.
- **superpowers** — replace `vendor/superpowers/` wholesale from a fresh clone
  (drop its `.git/`), and bump the version in `.claude-plugin/marketplace.json`.
- **baoyu-skills** — re-copy `skills/`, `docs/`, `packages/baoyu-codex-imagegen/`,
  `LICENSE`, and both READMEs into `vendor/baoyu-skills/`, and bump the version in
  `.claude-plugin/marketplace.json`.

Then run `./scripts/sync-local-skills.sh` and update the commits in the table above.

## License

All three collections are MIT. `LICENSE` is taste-skill's (© 2026 Leonxlnx); the
others keep their own at `vendor/superpowers/LICENSE` (© 2025 Jesse Vincent) and
`vendor/baoyu-skills/LICENSE` (© 2026 Jim Liu).
