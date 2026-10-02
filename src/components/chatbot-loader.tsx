"use client";

import dynamic from "next/dynamic";

/**
 * Same lazy-load pattern as crewupapp's chatbot-loader.tsx — keeps the
 * Chatbot's JS out of the initial bundle of every page it's mounted on;
 * it's fetched only once the browser is idle enough to mount it.
 *
 * ssr: false requires being inside a Client Component boundary — that's
 * this whole file's job; server components import THIS wrapper instead
 * of the real Chatbot directly.
 */
const Chatbot = dynamic(() => import("@/components/chatbot").then((m) => m.Chatbot), {
  ssr: false,
});

export function ChatbotLoader({
  userName,
  accountType,
}: {
  userName?: string;
  accountType?: string;
}) {
  return <Chatbot userName={userName} accountType={accountType} />;
}
