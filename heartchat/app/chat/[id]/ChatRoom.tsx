"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Character } from "@/lib/characters";

const FREE_MESSAGE_LIMIT = 30;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

function makeId() {
  return Math.random().toString(36).slice(2);
}

function loadHistory(characterId: string): Message[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`chat:${characterId}`);
    if (!raw) return null;
    return JSON.parse(raw) as Message[];
  } catch {
    return null;
  }
}

function saveHistory(characterId: string, messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`chat:${characterId}`, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

function loadCount(characterId: string): number {
  if (typeof window === "undefined") return 0;
  const v = localStorage.getItem(`count:${characterId}`);
  return v ? parseInt(v, 10) : 0;
}

function saveCount(characterId: string, count: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`count:${characterId}`, String(count));
}

export function ChatRoom({ character }: { character: Character }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    const saved = loadHistory(character.id);
    if (saved && saved.length > 0) {
      setMessages(saved);
    } else {
      const greeting =
        character.greetings[Math.floor(Math.random() * character.greetings.length)];
      setMessages([
        { id: makeId(), role: "assistant", content: greeting },
      ]);
    }
    setUserMsgCount(loadCount(character.id));
    setHydrated(true);
  }, [character.id]);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    saveHistory(character.id, messages);
  }, [messages, character.id, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    saveCount(character.id, userMsgCount);
  }, [userMsgCount, character.id, hydrated]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    if (userMsgCount >= FREE_MESSAGE_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const userMsg: Message = { id: makeId(), role: "user", content: text };
    const placeholderId = makeId();
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      content: "",
      pending: true,
    };

    const newCount = userMsgCount + 1;
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setUserMsgCount(newCount);
    setInput("");
    setBusy(true);

    try {
      const apiMessages = [
        ...messages
          .filter((m) => !m.pending)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: userMsg.role, content: userMsg.content },
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`서버 오류 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, "").trim();
          if (!data) continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "delta") {
              accumulated += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, content: accumulated, pending: false }
                    : m,
                ),
              );
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch {
            // ignore partial chunks
          }
        }
      }

      // Ensure placeholder is unmarked even if no deltas arrived
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: accumulated || "...", pending: false }
            : m,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "오류 발생";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                pending: false,
                content: `(${message}) — 잠시 후 다시 시도해 주세요.`,
              }
            : m,
        ),
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function resetConversation() {
    if (!confirm(`${character.name}와의 대화를 초기화할까요?`)) return;
    const greeting =
      character.greetings[Math.floor(Math.random() * character.greetings.length)];
    setMessages([{ id: makeId(), role: "assistant", content: greeting }]);
    setUserMsgCount(0);
    setShowPaywall(false);
  }

  const remaining = Math.max(0, FREE_MESSAGE_LIMIT - userMsgCount);

  return (
    <div className="flex-1 flex flex-col h-dvh max-w-md mx-auto w-full bg-black/40">
      {/* Header */}
      <header
        className={`relative px-4 py-3 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r ${character.gradient}`}
      >
        <Link
          href="/"
          className="text-white/90 active:opacity-50 p-1 -ml-1"
          aria-label="뒤로"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl shadow-lg">
          {character.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white truncate">
              {character.name}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
          </div>
          <div className="text-[11px] text-white/80 truncate">
            온라인 · {character.tagline}
          </div>
        </div>
        <button
          onClick={resetConversation}
          className="text-white/80 active:opacity-50 p-1 text-xs"
          aria-label="대화 초기화"
        >
          🔄
        </button>
      </header>

      {/* Free counter */}
      {remaining <= 10 && remaining > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-center text-xs text-amber-300">
          무료 메시지 {remaining}개 남음
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-hide px-4 py-4">
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} character={character} />
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-3 pt-2 pb-3 border-t border-white/10 bg-black/60 backdrop-blur">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder={`${character.name}에게 메시지...`}
            disabled={busy}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm placeholder-white/30 focus:outline-none focus:border-white/30 resize-none max-h-32"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center disabled:opacity-30 disabled:from-zinc-700 disabled:to-zinc-700 active:scale-90 transition-transform"
            aria-label="보내기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l14-7-7 14-2-5-5-2z"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="white"
              />
            </svg>
          </button>
        </div>
      </div>

      {showPaywall && (
        <Paywall
          character={character}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  character,
}: {
  message: Message;
  character: Character;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-pink-500 to-rose-600 text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start items-end gap-2">
      <div
        className={`w-7 h-7 rounded-full bg-gradient-to-br ${character.gradient} flex items-center justify-center text-sm shrink-0`}
      >
        {character.emoji}
      </div>
      <div className="max-w-[78%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-white/10 text-white text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[2.25rem]">
        {message.pending && !message.content ? (
          <span className="flex gap-1 items-center py-1">
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-white/60" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-white/60" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-white/60" />
          </span>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}

function Paywall({
  character,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 pb-8 animate-[slideUp_0.3s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 active:opacity-50 text-xl"
          aria-label="닫기"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <div className="text-5xl mb-3">{character.emoji}</div>
          <h2 className="text-xl font-bold mb-1">
            {character.name}와 계속 대화하기
          </h2>
          <p className="text-sm text-white/60">
            무료 메시지를 모두 사용했어요.
            <br />
            프리미엄으로 무제한 대화를 시작하세요.
          </p>
        </div>

        <div className="space-y-2 mb-6">
          <PlanCard
            label="주간"
            price="₩4,900"
            sub="/ 주"
            features={["무제한 메시지", "모든 캐릭터", "음성 메시지"]}
          />
          <PlanCard
            label="월간 (인기)"
            price="₩14,900"
            sub="/ 월"
            highlight
            features={[
              "무제한 메시지",
              "모든 캐릭터",
              "음성 메시지",
              "사진 공유",
              "관계 메모리 +",
            ]}
          />
          <PlanCard
            label="연간"
            price="₩99,000"
            sub="/ 년 (44% 할인)"
            features={["월간의 모든 혜택", "신규 캐릭터 우선 공개"]}
          />
        </div>

        <button className="w-full py-3.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 font-semibold text-white active:scale-[0.98] transition-transform">
          7일 무료 체험 시작
        </button>
        <p className="text-[10px] text-white/40 text-center mt-3">
          언제든 해지 가능 · 자동 결제
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  label,
  price,
  sub,
  features,
  highlight,
}: {
  label: string;
  price: string;
  sub: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        highlight
          ? "bg-gradient-to-br from-pink-500/20 to-rose-600/20 border-pink-400/50"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold">{label}</span>
        <div>
          <span className="text-lg font-bold">{price}</span>
          <span className="text-xs text-white/60 ml-1">{sub}</span>
        </div>
      </div>
      <div className="text-[11px] text-white/70 space-y-0.5">
        {features.map((f) => (
          <div key={f}>· {f}</div>
        ))}
      </div>
    </div>
  );
}
