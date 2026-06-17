import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

const pingSchema = z.object({ ok: z.boolean() });
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = await prisma.aiProviderConfig.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  if (!provider.apiKey?.trim()) {
    return NextResponse.json({ error: "Provider API key is empty" }, { status: 400 });
  }

  const started = Date.now();
  try {
    if (provider.protocol === "openai_responses") {
      const client = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined });
      const response = await client.responses.parse({
        model: provider.model,
        input: "Return {\"ok\":true}.",
        max_output_tokens: 64,
        text: { format: zodTextFormat(pingSchema, "settings_ping") },
      });
      pingSchema.parse(response.output_parsed);
    } else if (provider.protocol === "anthropic_messages") {
      const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl || undefined });
      const response = await client.messages.parse({
        model: provider.model,
        max_tokens: 64,
        messages: [{ role: "user", content: "Return {\"ok\":true}." }],
        output_config: {
          format: zodOutputFormat(pingSchema),
        },
      });
      pingSchema.parse(response.parsed_output);
    } else {
      throw new Error(`Unsupported protocol: ${provider.protocol}`);
    }
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started },
      { status: 400 },
    );
  }
}
