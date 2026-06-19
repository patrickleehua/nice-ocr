import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AiProviderConfig } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { decryptSecret } from "@/lib/crypto/secret";
import { extractionResultSchema, normalizeExtraction } from "@/lib/recognition/schema";
import {
  defaultRecognitionPrompts,
  getActiveRecognitionTarget,
  type RecognitionTarget,
  type ProviderProtocol,
} from "@/lib/recognition/settings";

export interface RecognitionInput {
  imageBase64: string;
  mimeType: string;
}

/** 一次识别使用的提示词（system + user）。 */
export interface ProviderPrompts {
  systemPrompt: string;
  userPrompt: string;
}

/** provider 覆盖优先，其次全局默认，最后内置默认。空白视为未设置。 */
export function resolveProviderPrompts(
  config: { systemPrompt?: string | null; userPrompt?: string | null },
  defaults?: { systemPrompt?: string | null; userPrompt?: string | null },
): ProviderPrompts {
  return {
    systemPrompt:
      config.systemPrompt?.trim() ||
      defaults?.systemPrompt?.trim() ||
      defaultRecognitionPrompts.systemPrompt,
    userPrompt:
      config.userPrompt?.trim() ||
      defaults?.userPrompt?.trim() ||
      defaultRecognitionPrompts.userPrompt,
  };
}

export type NormalizedExtraction = ReturnType<typeof normalizeExtraction>;

export interface RecognitionProviderResult {
  extraction: NormalizedExtraction;
  providerKey: string;
  protocol: ProviderProtocol;
  model: string;
  tokenUsage?: unknown;
  rawResponse: unknown;
}

export interface RecognitionProvider {
  key: string;
  protocol: ProviderProtocol;
  model: string;
  recognize(input: RecognitionInput): Promise<RecognitionProviderResult>;
}

export async function createConfiguredRecognitionProvider() {
  const target = await getActiveRecognitionTarget();
  return createRecognitionProvider(target, resolveProviderPrompts(target.provider));
}

export function createRecognitionProvider(
  target: RecognitionTarget,
  prompts: ProviderPrompts = resolveProviderPrompts(target.provider),
): RecognitionProvider {
  if (target.provider.protocol === "openai_responses") {
    return new OpenAIResponsesProvider(target, prompts);
  }
  if (target.provider.protocol === "anthropic_messages") {
    return new AnthropicMessagesProvider(target, prompts);
  }
  throw new Error(`Unsupported AI provider protocol: ${target.provider.protocol}`);
}

class OpenAIResponsesProvider implements RecognitionProvider {
  key: string;
  protocol = "openai_responses" as const;
  model: string;
  private client: OpenAI;
  private config: AiProviderConfig;
  private prompts: ProviderPrompts;

  constructor(target: RecognitionTarget, prompts: ProviderPrompts) {
    const config = target.provider;
    assertApiKey(config);
    this.config = config;
    this.prompts = prompts;
    this.key = config.providerKey;
    this.model = target.model.modelId;
    this.client = new OpenAI({
      apiKey: decryptSecret(config.apiKey),
      baseURL: config.baseUrl || undefined,
    });
  }

  async recognize(input: RecognitionInput): Promise<RecognitionProviderResult> {
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: this.prompts.systemPrompt },
            { type: "input_text", text: this.prompts.userPrompt },
            {
              type: "input_image",
              image_url: `data:${input.mimeType};base64,${input.imageBase64}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: this.config.maxOutputTokens,
      ...(this.config.temperature == null ? {} : { temperature: this.config.temperature }),
      text: {
        format: zodTextFormat(extractionResultSchema, "nice_ocr_extraction"),
      },
    });

    let parsed = response.output_parsed;
    if (!parsed) {
      const text = response.output_text?.trim();
      // 无结构化结果且无可解析文本 → 显式报错，让 job 重试/失败并记录，不静默产出空结果。
      if (!text) {
        throw new Error(`OpenAI 识别未返回结构化结果（provider=${this.key}, model=${this.model}）`);
      }
      parsed = extractionResultSchema.parse(JSON.parse(text));
    }
    return {
      extraction: normalizeExtraction(parsed),
      providerKey: this.key,
      protocol: this.protocol,
      model: this.model,
      tokenUsage: response.usage,
      rawResponse: response,
    };
  }
}

class AnthropicMessagesProvider implements RecognitionProvider {
  key: string;
  protocol = "anthropic_messages" as const;
  model: string;
  private client: Anthropic;
  private config: AiProviderConfig;
  private prompts: ProviderPrompts;

  constructor(target: RecognitionTarget, prompts: ProviderPrompts) {
    const config = target.provider;
    assertApiKey(config);
    this.config = config;
    this.prompts = prompts;
    this.key = config.providerKey;
    this.model = target.model.modelId;
    this.client = new Anthropic({
      apiKey: decryptSecret(config.apiKey),
      baseURL: config.baseUrl || undefined,
    });
  }

  async recognize(input: RecognitionInput): Promise<RecognitionProviderResult> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: this.config.maxOutputTokens,
      ...(this.config.temperature == null ? {} : { temperature: this.config.temperature }),
      system: this.prompts.systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: toAnthropicMediaType(input.mimeType),
                data: input.imageBase64,
              },
            },
            {
              type: "text",
              text: this.prompts.userPrompt,
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(extractionResultSchema),
      },
    });
    // 无结构化结果 → 显式报错，不再静默回退空 schema（否则会把空结果当成功落库）。
    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(`Anthropic 识别未返回结构化结果（provider=${this.key}, model=${this.model}）`);
    }
    return {
      extraction: normalizeExtraction(parsed),
      providerKey: this.key,
      protocol: this.protocol,
      model: this.model,
      tokenUsage: response.usage,
      rawResponse: response,
    };
  }
}

function assertApiKey(config: AiProviderConfig) {
  if (!config.apiKey?.trim()) {
    throw new Error(`AI provider ${config.providerKey} is missing apiKey in database settings`);
  }
}

function toAnthropicMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/gif") return "image/gif";
  if (mimeType === "image/webp") return "image/webp";
  return "image/jpeg";
}
