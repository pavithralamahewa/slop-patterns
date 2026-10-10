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
    <div className="min-h-screen bg-white text-[#1a1a1a]">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between px-6 py-4">
        <Link href="/" className="text-[15px] font-semibold">
          Held
        </Link>
        <nav className="flex items-center gap-6 text-[13px] text-[#6b6b6b]">
          <a href="#how" className="hidden hover:text-[#1a1a1a] sm:inline">
            How it works
          </a>
          <Link
            href="/sprint"
            className="btn-signal inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium"
          >
            Try the guided demo
          </Link>
        </nav>
      </header>

      <main>
        {/* Maze / Dovetail-style hero: sentence headline, two CTAs, no glow */}
        <section className="mx-auto max-w-[720px] px-6 pb-24 pt-20 text-center md:pt-28">
          <h1 className="text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[3.25rem]">
            Answer one hard product question before you build
          </h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-[16px] leading-relaxed text-[#6b6b6b] md:text-[18px]">
            Held walks a team through a short week: name the bet, explore real
            options, choose, fake a product, watch five people, write a verdict.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sprint"
              className="btn-signal inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Start the guided demo
            </Link>
            <a
              href="#how"
              className="inline-flex items-center rounded-full border border-[#e2e2e2] bg-white px-5 py-2.5 text-[14px] font-medium text-[#1a1a1a] hover:border-[#cfcfcf]"
            >
              See the steps first
            </a>
          </div>
          <p className="mt-4 text-[13px] text-[#8a8a8a]">
            No design-sprint experience required. Every step is explained.
          </p>
        </section>

        <section className="border-t border-[#ebebeb]">
          <div className="mx-auto max-w-[1080px] px-6 py-16 md:py-20">
            <h2 className="max-w-xl text-[1.75rem] font-semibold tracking-[-0.02em] md:text-[2rem]">
              Most teams build first and learn later
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-12">
              {PROBLEMS.map((p) => (
                <article key={p.title}>
                  <h3 className="text-[15px] font-medium">{p.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#6b6b6b]">
                    {p.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-[#ebebeb] bg-[#fafafa]">
          <div className="mx-auto max-w-[720px] px-6 py-16 md:py-20">
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] md:text-[2rem]">
              Seven steps. One job each.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#6b6b6b]">
              A design sprint, written so you do not need to already know the
              method.
            </p>
            <ol className="mt-10 divide-y divide-[#ebebeb] border-y border-[#ebebeb]">
              {PHASE_ORDER.map((id, i) => {
                const g = PHASE_GUIDE[id];
                return (
                  <li key={id} className="flex gap-6 py-5">
                    <span className="w-6 shrink-0 pt-0.5 text-[13px] text-[#8a8a8a]">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-[15px] font-medium">{g.plainName}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-[#6b6b6b]">
                        {g.inOneSentence}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="border-t border-[#ebebeb]">
          <div className="mx-auto max-w-[720px] px-6 py-16 md:py-20">
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] md:text-[2rem]">
              You leave with a Verdict Packet
            </h2>
            <ul className="mt-8 space-y-4 text-[15px] leading-relaxed text-[#6b6b6b]">
              <li>
                <span className="font-medium text-[#1a1a1a]">The bet</span> —
                who you help and why they would choose you
              </li>
              <li>
                <span className="font-medium text-[#1a1a1a]">The evidence</span>{" "}
                — research links and what real users did
              </li>
              <li>
                <span className="font-medium text-[#1a1a1a]">The call</span> —
                Ship, Loop, or Kill, with next build steps
              </li>
            </ul>
            <Link
              href="/sprint"
              className="btn-signal mt-10 inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium"
            >
              Start the guided demo
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ebebeb] px-6 py-6">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between text-[13px] text-[#8a8a8a]">
          <span className="font-medium text-[#6b6b6b]">Held</span>
          <span>2026</span>
        </div>
      </footer>
    </div>
  );
}
