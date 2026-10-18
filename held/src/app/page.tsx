import Link from "next/link";
import { Mascot } from "@/components/game/Mascot";

export default function HomePage() {
  return (
    <div className="held-playfield min-h-screen text-[var(--ink)]">
      {/* Duolingo home path energy
          https://mobbin.com/screens/fd077091-e8e9-413f-9aff-bb68984e5b04 */}
      <header className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold">
          <span className="inline-block h-4 w-4 rounded-full bg-[#58CC02] shadow-[0_2px_0_#58A700]" />
          Held
        </Link>
        <Link
          href="/sprint"
          className="btn-signal inline-flex items-center px-4 py-2 text-[12px]"
        >
          Play
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-[560px] flex-col items-center justify-center px-6 pb-24 text-center">
        <Mascot mood="cheer" size={112} />
        <p className="mt-4 text-[2.75rem] font-extrabold leading-none tracking-[-0.03em] text-[#58CC02] md:text-[3.5rem]">
          Held
        </p>
        <h1 className="mt-4 text-[1.35rem] font-extrabold leading-snug tracking-[-0.02em] text-[#3C3C3C] md:text-[1.65rem]">
          Answer one hard product question before you build
        </h1>
        <p className="mt-3 max-w-[26rem] text-[15px] font-semibold leading-relaxed text-[#777777]">
          Clear seven levels. Earn XP. Leave with a Ship / Loop / Kill verdict.
        </p>
        <Link
          href="/sprint"
          className="btn-signal mt-8 inline-flex items-center px-8 py-3.5 text-[15px]"
        >
          Start the guided demo
        </Link>
        <p className="mt-3 text-[12px] font-bold uppercase tracking-wide text-[#FFC800]">
          +20 XP on level 1
        </p>
      </main>
    </div>
  );
}
