import Link from "next/link";
import { CHARACTERS } from "@/lib/characters";

export default function HomePage() {
  return (
    <main className="flex-1 max-w-md mx-auto w-full px-5 py-8 flex flex-col">
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">💗</span>
          <h1 className="text-2xl font-bold tracking-tight">하트챗</h1>
        </div>
        <p className="text-sm text-white/60">
          오늘 누구랑 이야기하고 싶어요?
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {CHARACTERS.map((c) => (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className="group relative overflow-hidden rounded-2xl aspect-[3/4] active:scale-[0.97] transition-transform"
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${c.gradient}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0" />

            <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />

            <div className="absolute top-4 left-4 text-4xl drop-shadow-lg">
              {c.emoji}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <div className="text-xs font-medium text-white/80 mb-0.5">
                {c.tagline}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold">{c.name}</span>
                <span className="text-xs text-white/70">{c.age}</span>
              </div>
              <div className="text-[11px] text-white/60 mt-0.5 truncate">
                {c.job}
              </div>
            </div>
          </Link>
        ))}
      </section>

      <footer className="mt-auto pt-8 text-center">
        <p className="text-[11px] text-white/40 leading-relaxed">
          AI 캐릭터와의 대화입니다. 실제 사람이 아니에요.
          <br />
          무료 메시지 30개 이후 프리미엄 구독이 필요합니다.
        </p>
      </footer>
    </main>
  );
}
