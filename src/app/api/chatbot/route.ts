import { NextResponse, type NextRequest } from "next/server";

import { featureHighlights, freePlanFeatures, proPlanFeatures } from "@/lib/landing-data";

/**
 * Calls OpenAI's Chat Completions API server-side so the key is never
 * exposed to the browser. Mirrors crewupapp's /api/chatbot — same env
 * vars, same OpenAI account/project, same request shape. Model is read
 * from OPENAI_DEFAULT_MODEL (falls back to "gpt-5.6-luna" if unset).
 *
 * REQUIRES two environment variables: OPENAI_API_KEY, OPENAI_PROJECT_ID
 * (the project id is required alongside a project-scoped `sk-proj-...`
 * key — OpenAI rejects those keys without a matching OpenAI-Project
 * header). Without them, this route responds with a clear, honest
 * error instead of pretending to work.
 */

type ChatRole = "user" | "assistant";
type ChatMessagePayload = { role: ChatRole; text: string };

const DEFAULT_MODEL = "gpt-5.6-luna";

const BASE_SYSTEM_PROMPT = `You are Prime, the GovConUnited Assistant — a helpful chat assistant embedded in GovConUnited, a network connecting government contractors, subcontractors, consultants, suppliers, and other GovCon professionals with opportunities, trusted relationships, resources, and events.

Core things GovConUnited lets people do:
- Find federal, state, local, and subcontracting opportunities, with saved searches and alerts.
- Build a professional and company profile with capabilities, certifications, past performance, and service areas.
- Grow a network — connect and follow members, browse a company directory, message other professionals.
- Join the community — post, comment, share, and get advice from GovCon peers in trade/topic communities.
- Access resources — guides, templates, and tools for competing on government contracts.
- Attend events — webinars, conferences, meetups, and Q&A sessions.

Keep answers short, friendly, and specific to government contracting use cases. If asked something totally unrelated to GovConUnited or government contracting, answer briefly and steer back to how GovConUnited can help. Only use the real plan pricing and features given to you below — never invent a price, feature, or capability that isn't listed there.`;

function buildGroundedSystemPrompt(): string {
  const planSection = `\n\nReal current plans:
- GovConUnited Free ($0/forever): ${freePlanFeatures.join(", ")}.
- GovConUnited Pro ($49/month, or $490/year — saves $98/year): ${proPlanFeatures.join(", ")}.`;

  const featuresSection = `\n\nReal platform features: ${featureHighlights
    .map((f) => `${f.title} — ${f.description}`)
    .join(" | ")}`;

  return BASE_SYSTEM_PROMPT + planSection + featuresSection;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const projectId = process.env.OPENAI_PROJECT_ID;
  if (!apiKey || !projectId) {
    return NextResponse.json(
      {
        error:
          "The chatbot isn't configured yet — OPENAI_API_KEY / OPENAI_PROJECT_ID are missing on the server.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessagePayload[]; userName?: string; accountType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
  }

  let systemPrompt = buildGroundedSystemPrompt();

  // Light personalization when called from a logged-in page — the
  // public landing-page instance calls this with no userName/accountType,
  // so this block is simply skipped for anonymous visitors.
  if (body.userName) {
    systemPrompt += `\n\nThe person you're talking to is logged in as ${body.userName}${
      body.accountType ? ` (on the ${body.accountType === "pro" ? "GovConUnited Pro" : "GovConUnited Free"} plan)` : ""
    }. You can address them by name and tailor suggestions to their plan.`;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Project": projectId,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_DEFAULT_MODEL || DEFAULT_MODEL,
        max_completion_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.text })),
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[api/chatbot] OpenAI API error:", response.status, errBody);
      const message =
        response.status === 429 && errBody.includes("insufficient_quota")
          ? "The assistant is temporarily unavailable — the OpenAI account is out of credits."
          : "The assistant is temporarily unavailable. Please try again shortly.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const data = await response.json();
    const replyText: string =
      data.choices?.[0]?.message?.content ?? "Sorry, I didn't quite catch that — could you rephrase?";

    return NextResponse.json({ reply: replyText });
  } catch (err) {
    console.error("[api/chatbot] request failed:", err);
    return NextResponse.json(
      { error: "Something went wrong reaching the assistant. Please try again." },
      { status: 500 },
    );
  }
}
