import Link from "next/link";
import { PHASE_ORDER } from "@/lib/core/types";
import { PHASE_GUIDE } from "@/lib/guide/copy";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a]">
      {/* Maze nav: logo · links · outline + filled pills
          https://mobbin.com/sites/sections/68bbcac6-303d-4465-b420-8c02dde24eb9 */}
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="inline-block h-4 w-4 rounded-[4px] bg-[#5e6ad2]" />
          Held
        </Link>
        <nav className="flex items-center gap-3 text-[13px]">
          <a
            href="#how"
            className="hidden px-2 text-[#6b6b6b] hover:text-[#1a1a1a] sm:inline"
          >
            How it works
          </a>
          <a
            href="#how"
            className="hidden rounded-full border border-[#1a1a1a] px-3.5 py-1.5 font-medium sm:inline"
          >
            See the steps
          </a>
          <Link
            href="/sprint"
            className="btn-signal inline-flex items-center rounded-full px-3.5 py-1.5 font-medium"
          >
            Try the guided demo
          </Link>
        </nav>
      </header>

      <main>
        {/* Maze centered sentence hero + two pills
            https://mobbin.com/sites/sections/47670f60-b48f-40da-b042-0c201c15b325 */}
        <section className="mx-auto max-w-[760px] px-6 pb-16 pt-20 text-center md:pt-28">
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
              className="inline-flex items-center rounded-full border border-[#1a1a1a] bg-white px-5 py-2.5 text-[14px] font-medium text-[#1a1a1a]"
            >
              See the steps first
            </a>
          </div>
          <p className="mt-4 text-[13px] text-[#8a8a8a]">
            No design-sprint experience required. Every step is explained.
          </p>
        </section>

        {/* Linear issue-list product chrome under the hero
            https://mobbin.com/screens/0ac97560-1aef-4907-a356-8c18c749437b */}
        <section className="mx-auto max-w-[920px] px-6 pb-20">
          <div className="overflow-hidden rounded-[10px] border border-[#ebebeb] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <div className="flex min-h-[320px]">
              <aside className="hidden w-[200px] shrink-0 border-r border-[#ebebeb] bg-[#f7f7f7] p-3 sm:block">
                <p className="px-2 py-1 text-[12px] font-medium text-[#1a1a1a]">
                  Held
                </p>
                <p className="mt-3 px-2 text-[11px] text-[#8a8a8a]">This week</p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  <li className="rounded-md bg-[#ececec] px-2 py-1.5">Inbox</li>
                  <li className="px-2 py-1.5 text-[#6b6b6b]">My issues</li>
                  <li className="px-2 py-1.5 text-[#6b6b6b]">Projects</li>
                </ul>
              </aside>
              <div className="min-w-0 flex-1 p-5">
                <p className="text-[13px] font-medium text-[#1a1a1a]">
                  All issues
                </p>
                <ol className="mt-3 divide-y divide-[#f0f0f0]">
                  {PHASE_ORDER.map((id, i) => {
                    const g = PHASE_GUIDE[id];
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-3 py-2.5 text-[13px]"
                      >
                        <span className="w-4 text-[12px] text-[#8a8a8a]">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {g.plainName}
                        </span>
                        <span className="hidden text-[12px] text-[#8a8a8a] sm:inline">
                          {i === 0 ? "In Progress" : "Todo"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Maze left-aligned feature copy — not a three-card grid
            https://mobbin.com/sites/sections/6ff9f5d4-df2a-439c-b568-79e2a04c8bef */}
        <section className="border-t border-[#ebebeb]">
          <div className="mx-auto grid max-w-[1080px] gap-10 px-6 py-16 md:grid-cols-2 md:items-center md:py-20">
            <div>
              <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] md:text-[2rem]">
                Most teams build first and learn later
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#6b6b6b]">
                AI can spit out an app in an afternoon. Slack debates and one
                pretty mockup feel productive. A classic design sprint needs a
                facilitator and a full week of calendars — so most teams skip
                it, and ship the wrong thing faster than ever.
              </p>
              <a
                href="#how"
                className="mt-8 inline-flex items-center rounded-full border border-[#1a1a1a] px-5 py-2.5 text-[14px] font-medium"
              >
                See how Held holds the week
              </a>
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-[#6b6b6b]">
              Held is the missing operating system for that week: one Decider,
              append-only gates, diverse options, cited evidence, and a written
              verdict before engineering starts.
            </p>
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
            {/* Linear document numbered headings
                https://mobbin.com/screens/ea0c3b2c-ecb7-4f3a-8c91-4b96acbec446 */}
            <ol className="mt-10">
              {PHASE_ORDER.map((id, i) => {
                const g = PHASE_GUIDE[id];
                return (
                  <li key={id} className="flex gap-6 border-t border-[#ebebeb] py-5">
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

        {/* Maze footer CTA
            https://mobbin.com/sites/sections/0256fa74-e128-40e2-9d57-a6aa343b8b78 */}
        <section className="border-t border-[#ebebeb]">
          <div className="mx-auto max-w-[640px] px-6 py-20 text-center md:py-24">
            <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em] md:text-[2rem]">
              You leave with a Verdict Packet
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#6b6b6b]">
              The bet, the evidence, Ship / Loop / Kill, and what to build next
              — not a pile of sticky notes.
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
                className="inline-flex items-center rounded-full border border-[#1a1a1a] px-5 py-2.5 text-[14px] font-medium"
              >
                See the steps first
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ebebeb] px-6 py-6">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between text-[13px] text-[#8a8a8a]">
          <span className="flex items-center gap-2 font-medium text-[#6b6b6b]">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-[#5e6ad2]" />
            Held
          </span>
          <span>2026</span>
        </div>
      </footer>
    </div>
  );
}
