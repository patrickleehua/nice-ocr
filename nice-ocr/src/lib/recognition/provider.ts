import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AiProviderConfig } from "@prisma/client";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { extractionResultSchema, normalizeExtraction } from "@/lib/recognition/schema";
import { getActiveAiProviderConfig, type ProviderProtocol } from "@/lib/recognition/settings";

export interface RecognitionInput {
  imageBase64: string;
  mimeType: string;
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

const extractionPrompt =
  "识别图片中的副食品销售单或采购单表格。提取单据日期和明细行。不要输出解释，只按结构化 schema 返回 date 和 items；无法识别的字段用空字符串或 0。";

export async function createConfiguredRecognitionProvider() {
  return createRecognitionProvider(await getActiveAiProviderConfig());
}

export function createRecognitionProvider(config: AiProviderConfig): RecognitionProvider {
  if (config.protocol === "openai_responses") {
    return new OpenAIResponsesProvider(config);
  }
  if (config.protocol === "anthropic_messages") {
    return new AnthropicMessagesProvider(config);
  }
  throw new Error(`Unsupported AI provider protocol: ${config.protocol}`);
}

class OpenAIResponsesProvider implements RecognitionProvider {
  key: string;
  protocol = "openai_responses" as const;
  model: string;
  private client: OpenAI;
  private config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    assertApiKey(config);
    this.config = config;
    this.key = config.providerKey;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey ?? "",
      baseURL: config.baseUrl || undefined,
    });
  }

  async recognize(input: RecognitionInput): Promise<RecognitionProviderResult> {
    const response = await this.client.responses.parse({
      model: this.config.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: extractionPrompt },
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

    const parsed = response.output_parsed ?? extractionResultSchema.parse(JSON.parse(response.output_text || "{}"));
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

  constructor(config: AiProviderConfig) {
    assertApiKey(config);
    this.config = config;
    this.key = config.providerKey;
    this.model = config.model;
    this.client = new Anthropic({
      apiKey: config.apiKey ?? "",
      baseURL: config.baseUrl || undefined,
    });
  }

  async recognize(input: RecognitionInput): Promise<RecognitionProviderResult> {
    const response = await this.client.messages.parse({
      model: this.config.model,
      max_tokens: this.config.maxOutputTokens,
      ...(this.config.temperature == null ? {} : { temperature: this.config.temperature }),
      system: extractionPrompt,
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
              text: "请抽取这张单据图片中的日期和所有表格明细行。",
            },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(extractionResultSchema),
      },
    });
    const parsed = response.parsed_output ?? extractionResultSchema.parse({});
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
