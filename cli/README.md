# slop-patterns

Check web pages for the design patterns AI site builders keep shipping: gradient text headlines, three identical feature cards, emoji used as icons, tiny all-caps section labels, the pulsing "beta" dot, and more.

```bash
npx slop-patterns check ./dist         # local HTML, no network
npx slop-patterns scan example.com     # full scan with motion and phone checks, returns a report link
npx slop-patterns list                 # every pattern in the taxonomy
```

- `--json` for machine-readable output.
- `--strict` exits with 1 when one of the five graded patterns is found, so you can use it in CI.

It runs the same rules file as the [Slop Patterns scanner](https://sloppatterns.com/score) and the MCP server, so the three never disagree. The rules are conservative on purpose: a miss is better than a false finding. A finding says a page shows a pattern; it never says who or what made the page.

Taxonomy and research: [sloppatterns.com](https://sloppatterns.com). MIT licensed. By Pavithra Lamahewa, Precious Studio.
