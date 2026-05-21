import Anthropic from "@anthropic-ai/sdk";
import { getCharacter } from "@/lib/characters";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  const { characterId, messages } = (await request.json()) as {
    characterId: string;
    messages: ClientMessage[];
  };

  const character = getCharacter(characterId);
  if (!character) {
    return new Response("Character not found", { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Server is missing ANTHROPIC_API_KEY", { status: 500 });
  }

  const client = new Anthropic();

  const apiMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  if (apiMessages.length === 0 || apiMessages[0].role !== "user") {
    return new Response("First message must be from user", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: character.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: apiMessages,
        });

        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`,
              ),
            );
          }
        }

        const final = await messageStream.finalMessage();
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              usage: final.usage,
              stop_reason: final.stop_reason,
            })}\n\n`,
          ),
        );
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
