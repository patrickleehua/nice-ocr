import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptSecret } from "@/lib/crypto/secret";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const pingSchema = z.object({ ok: z.boolean() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, "provider-test", 10, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const provider = await prisma.aiProviderConfig.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  if (!provider.apiKey?.trim()) {
    return NextResponse.json({ error: "Provider API key is empty" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const modelId = String(body.modelId ?? "").trim();
  if (!modelId) {
    return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  }
  const model = await prisma.aiProviderModel.findFirst({
    where: { providerId: provider.id, modelId },
  });
  if (!model) {
    return NextResponse.json({ error: "Provider model not found" }, { status: 404 });
  }
  if (!model.enabled) {
    return NextResponse.json({ error: "Provider model is disabled" }, { status: 400 });
  }

  const apiKey = decryptSecret(provider.apiKey);
  const started = Date.now();
  try {
    if (provider.protocol === "openai_responses") {
      const client = new OpenAI({ apiKey, baseURL: provider.baseUrl || undefined });
      const response = await client.responses.parse({
        model: model.modelId,
        input: "Return {\"ok\":true}.",
        max_output_tokens: 64,
        text: { format: zodTextFormat(pingSchema, "settings_ping") },
      });
      pingSchema.parse(response.output_parsed);
    } else if (provider.protocol === "anthropic_messages") {
      const client = new Anthropic({ apiKey, baseURL: provider.baseUrl || undefined });
      const response = await client.messages.parse({
        model: model.modelId,
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
