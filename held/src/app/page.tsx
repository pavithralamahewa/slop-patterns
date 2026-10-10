import Link from "next/link";
import { PHASE_ORDER } from "@/lib/core/types";
import { PHASE_GUIDE } from "@/lib/guide/copy";

const PROBLEMS = [
  {
    title: "Building got too easy",
    body: "AI can spit out an app in an afternoon. Teams ship the wrong thing faster than ever.",
  },
  {
    title: "Opinions are not evidence",
    body: "Slack debates and one pretty mockup feel productive. They rarely prove customers will use it.",
  },
  {
    title: "Good process was expensive",
    body: "A classic design sprint needs a facilitator, a room, and a full week of calendars. Most teams skip it.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[100svh]"
        style={{
          background:
            "radial-gradient(70% 55% at 78% 18%, rgba(200,245,66,0.14), transparent 55%), radial-gradient(50% 40% at 12% 80%, rgba(232,213,183,0.08), transparent 60%), linear-gradient(180deg, #121614 0%, #0e1110 55%)",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6 md:px-8">
        <Link href="/" className="display text-2xl tracking-tight">
          Held
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[var(--ink-dim)]">
          <a href="#how" className="hidden hover:text-[var(--ink)] sm:inline">
            How it works
          </a>
          <Link
            href="/sprint"
            className="btn-signal rounded-md px-4 py-2 font-medium"
          >
            Try the guided demo
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[calc(100svh-88px)] max-w-6xl flex-col justify-end px-5 pb-16 pt-10 md:px-8 md:pb-20">
          <p className="mono rise mb-6 text-xs uppercase tracking-[0.22em] text-[var(--signal)]">
            Decide before you build
          </p>
          <h1 className="display rise-2 text-[clamp(3.2rem,10vw,6.5rem)] text-[var(--ink)]">
            Held
          </h1>
          <p className="rise-3 mt-6 max-w-xl text-lg text-[var(--ink-dim)] md:text-xl">
            A guided path to answer one hard product question with real people —
            before you spend months of engineering.
          </p>
          <p className="rise-3 mt-4 max-w-xl text-sm text-[var(--ink-mute)]">
            No design-sprint experience required. We explain every step as you
            go.
          </p>
          <div className="rise-4 mt-10 flex flex-wrap gap-3">
            <Link
              href="/sprint"
              className="btn-signal inline-flex items-center justify-center rounded-md px-5 py-3 font-medium"
            >
              Start the guided demo
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center rounded-md border border-[var(--line)] px-5 py-3 font-medium text-[var(--ink)] transition hover:border-[var(--ink-dim)]"
            >
              See the steps first
            </a>
          </div>
        </section>

        <section className="border-t border-[var(--line)] bg-[var(--ground-2)]/40">
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
            <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--ink-mute)]">
              The problem
            </p>
            <h2 className="display mt-3 max-w-2xl text-4xl md:text-5xl">
              Most teams build first and learn later. Held reverses that.
            </h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {PROBLEMS.map((p) => (
                <article key={p.title}>
                  <h3 className="text-lg font-medium">{p.title}</h3>
                  <p className="mt-3 text-sm text-[var(--ink-dim)]">{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
            <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--ink-mute)]">
              How Held works
            </p>
            <h2 className="display mt-3 max-w-2xl text-4xl md:text-5xl">
              Seven plain steps. One job each.
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--ink-dim)]">
              Based on a proven product method (a “design sprint”), rewritten so
              newcomers are never lost in jargon.
            </p>
            <ol className="mt-14 space-y-8">
              {PHASE_ORDER.map((id, i) => {
                const g = PHASE_GUIDE[id];
                return (
                  <li
                    key={id}
                    className="grid gap-3 border-b border-[var(--line)] pb-8 md:grid-cols-[80px_1fr]"
                  >
                    <span className="mono text-[var(--signal)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-xl font-medium">{g.plainName}</h3>
                      <p className="mt-2 max-w-2xl text-[var(--ink-dim)]">
                        {g.inOneSentence}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="border-t border-[var(--line)] bg-[var(--ground-2)]/40">
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
            <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--ink-mute)]">
              What you leave with
            </p>
            <h2 className="display mt-3 max-w-2xl text-4xl md:text-5xl">
              A Verdict Packet — not a pile of sticky notes.
            </h2>
            <ul className="mt-10 max-w-xl space-y-4 text-[var(--ink-dim)]">
              <li>
                <strong className="text-[var(--ink)]">The bet</strong> — who you
                help and why they would choose you
              </li>
              <li>
                <strong className="text-[var(--ink)]">The evidence</strong> —
                research links and (after interviews) what real users did
              </li>
              <li>
                <strong className="text-[var(--ink)]">The call</strong> — Ship,
                Loop (iterate), or Kill — with next build steps
              </li>
            </ul>
            <Link
              href="/sprint"
              className="btn-signal mt-10 inline-block rounded-md px-6 py-3 font-medium"
            >
              Run the guided demo now
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--line)] px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm text-[var(--ink-mute)] sm:flex-row sm:items-center sm:justify-between">
          <span className="display text-lg text-[var(--ink-dim)]">Held</span>
          <span>Decide before you build · 2026</span>
        </div>
      </footer>
    </div>
  );
}
