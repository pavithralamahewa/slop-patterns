# Slop Patterns

A public library of AI design anti-patterns: what they look like, why the tools produce them, and what to do instead. Live at [sloppatterns.com](https://sloppatterns.com).

- **License: MIT** ([LICENSE](LICENSE)). Only the pattern library is here and MIT: `patterns.json`, the pattern text and sources, the site, and the MCP server in `api/`.
- **Scanner code is not open.** The Slop Score scanner at [sloppatterns.com/score](https://sloppatterns.com/score) (browser capture, live checks and grading) is a separate project and is not included in this repo.
- **The MCP server** runs at `https://sloppatterns.com/mcp`. No account or key. See the "For agents" page on the site.
- **The research note**, The Same Page, is in `research/`.

Maintained by Pavithra Lamahewa at [Precious Studio](https://precious.studio). Suggest a pattern from the site, or open an issue.

## Use it in your AI tools

Your coding agent calls `check_design` on the UI it writes and fixes what it finds before you see it.

- **Claude Code (plugin, MCP plus a skill):**
  ```
  /plugin marketplace add pavithralamahewa/slop-patterns
  /plugin install slop-patterns@slop-patterns
  ```
- **Any MCP client:** `npx add-mcp https://sloppatterns.com/mcp`, or add an HTTP server with that URL. It is in the official MCP Registry as `com.sloppatterns/slop-patterns`.
- **Cursor:** add the server in Settings → MCP (type HTTP, URL above), then copy [`cursor/slop-patterns.mdc`](cursor/slop-patterns.mdc) into `.cursor/rules/`.

## Use the taxonomy

Every pattern has a stable code (for example `A10`) and a stable URL (`https://sloppatterns.com/#gradient-text-headline`). Codes never change meaning; when an entry is revised, its `version` and `updated` fields change.

- **All 531 patterns as data:** [`taxonomy.json`](https://sloppatterns.com/taxonomy.json). Each entry says whether it is checked automatically (101 are; the scanner, the MCP server and the command line share 104 code rules, and 57 of them have passed a hand audit on whole pages) or needs a person.
- **Command line:** `npx slop-patterns check ./dist` or `npx slop-patterns scan example.com`. See [`cli/`](cli/).
- **One rule set:** the scanner, the MCP server and the command line run the same `rules.js`, so they never disagree.
- **Cite it:** see [`CITATION.cff`](CITATION.cff). GitHub shows a "Cite this repository" button from it.
