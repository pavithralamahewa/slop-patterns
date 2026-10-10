import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a]">
      {/* Maze single-focus hero
          https://mobbin.com/sites/sections/d5c4a9ed-9d09-43e0-8944-91eae00526fa */}
      <header className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="inline-block h-3.5 w-3.5 rounded-[3px] bg-[#5e6ad2]" />
          Held
        </Link>
        <Link
          href="/sprint"
          className="btn-signal inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium"
        >
          Start
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[640px] flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-[2.5rem] font-semibold leading-[1.12] tracking-[-0.025em] md:text-[3.5rem]">
          Answer one hard product question before you build
        </h1>
        <p className="mt-5 max-w-[28rem] text-[16px] leading-relaxed text-[#6b6b6b]">
          A short guided week. One decision. A written verdict.
        </p>
        <Link
          href="/sprint"
          className="btn-signal mt-8 inline-flex items-center rounded-full px-6 py-3 text-[15px] font-medium"
        >
          Start the guided demo
        </Link>
      </main>
    </div>
  );
}
