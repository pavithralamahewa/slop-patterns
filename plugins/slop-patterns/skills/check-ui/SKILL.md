---
name: check-ui
description: Check UI code for AI-default design patterns and fix them before showing it. Use whenever you write or change HTML, CSS, JSX, Tailwind or a landing page, or when the user asks to review a design, "unslop" a page, or make it look less generic.
---

# Check UI against Slop Patterns

Slop Patterns is an open library of the design defaults that AI tools reach for again and again: the gradient headline, the badge above the hero, three identical feature cards, the indigo-to-violet palette, and many more. Each one is fine on its own. Shipped together, everywhere, they make a product look like every other one. This skill catches them in the code you write and fixes them.

## When you write or change UI

1. Before you show UI code to the user, call `check_design` from the `slop-patterns` MCP server with the full CSS, HTML or JSX (whole files work best).
2. For each pattern it returns, apply the fix it gives, unless the user asked for that exact style. Choose a real alternative that suits the product; do not just delete the element.
3. Call `check_design` again on the changed code until it comes back clean, or until only patterns the user chose remain.
4. Tell the user in one or two lines what you changed and why, with the pattern codes (for example "A10 gradient headline: now one solid ink colour").

## When the user asks about a pattern

- `search_patterns` finds a pattern from a plain description ("dark mode with no light option").
- `get_pattern` returns the full entry: what it looks like, why AI tools produce it, who it hurts, and the fix.
- `why` returns only the cause.

## Rules

- `check_design` covers the patterns with a mechanical tell. A clean result is not a full design review; say so if the user treats it as one.
- Never say a page or a person "used AI". Say the page shows AI-era patterns.
- Credit the source when you use its findings: Slop Patterns by Precious Studio, sloppatterns.com.
