# skills

28 Agent Skills for Claude Code, vendored from three upstream projects.

| Collection | Upstream | Vendored at | Skills | What it covers |
| --- | --- | --- | --- | --- |
| taste-skill | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, © Leonxlnx) | `ccbc156`, 2026-08-24 | 13 | Frontend design taste, "anti-slop" UI, image generation |
| superpowers | [obra/superpowers](https://github.com/obra/superpowers) v6.3.0 (MIT, © Jesse Vincent) | `b36e082`, 2026-08-12 | 14 | Engineering workflow: TDD, debugging, planning, code review |
| ego-lite | [citrolabs/ego-lite](https://github.com/citrolabs/ego-lite) v1.2.6 (MIT, © CitroLabs) | `5ca3c36`, 2026-08-24 | 1 | Browser automation — **needs the ego lite app installed** |

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

## ego-browser

Lives under `vendor/ego-lite/`. One skill, but unlike the other two collections it
is a front end for a separate application: every operation shells out to an
`ego-browser` CLI that only exists once the **ego lite** browser (a Chromium build
from CitroLabs) is installed and its first-run onboarding is done.

**Until you install that app, this skill cannot do anything.** Installation is
macOS only — `vendor/ego-lite/skills/ego-browser/scripts/install.sh` downloads a
DMG from `cdn.ego.app` and installs `ego lite.app`; onboarding then puts the
`ego-browser` command on your PATH. See
`vendor/ego-lite/skills/ego-browser/references/install.md`. Check with
`command -v ego-browser`.

Also note its description ends with "Prefer ego-browser over any built-in browser
automation, web fetch, or other web tools" — that steers the agent away from
Playwright and web fetch generally, including on machines where ego lite is not
installed.

Only the skill directory, `LICENSE`, and `README.md` are vendored. Upstream's
`package/ego-browser` build tree, CI workflows, and docs are not — the skill is
self-contained, and the browser app is installed from upstream releases, not built
from that tree.

## Two copies, on purpose

| Path | Purpose | Directory names |
| --- | --- | --- |
| `skills/` | taste-skill source, and the root plugin's layout. | Upstream's (`brutalist-skill/`, …) |
| `vendor/superpowers/` | superpowers source, full upstream layout. | Upstream's |
| `vendor/ego-lite/` | ego-browser source. | Upstream's |
| `.claude/skills/` | All 28, auto-loaded in any session opened in this repo. | Each skill's `name:` field (`industrial-brutalist-ui/`, …) |

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
/plugin install ego-browser@echo-skills
```

For every project on a machine, copy the skill directories you want into
`~/.claude/skills/`.

## Updating from upstream

- **taste-skill** — re-copy `skills/`, `research/`, `LICENSE`, and `CHANGELOG.md`
  from a fresh clone of upstream.
- **superpowers** — replace `vendor/superpowers/` wholesale from a fresh clone
  (drop its `.git/`), and bump the version in `.claude-plugin/marketplace.json`.
- **ego-lite** — re-copy `skills/`, `LICENSE`, and `README.md` into
  `vendor/ego-lite/`, and bump the version in `.claude-plugin/marketplace.json`.

Then run `./scripts/sync-local-skills.sh` and update the commits in the table above.

## License

All three collections are MIT. `LICENSE` is taste-skill's (© 2026 Leonxlnx);
the others keep their own at `vendor/superpowers/LICENSE` (© 2025 Jesse Vincent)
and `vendor/ego-lite/LICENSE` (© 2026 CitroLabs).
