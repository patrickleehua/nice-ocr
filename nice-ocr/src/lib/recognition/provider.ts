import OpenAI from "openai";
import { env } from "@/lib/env";
import { extractionResultSchema, normalizeExtraction } from "@/lib/recognition/schema";

export interface RecognitionInput {
  imageBase64: string;
  mimeType: string;
}

export interface RecognitionProvider {
  key: string;
  recognize(input: RecognitionInput): Promise<ReturnType<typeof normalizeExtraction>>;
}

export class OpenAICompatibleProvider implements RecognitionProvider {
  key = "openai-compatible";

  private client = new OpenAI({
    apiKey: env.openaiApiKey,
    baseURL: env.openaiBaseUrl,
  });

  async recognize(input: RecognitionInput) {
    if (!env.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await this.client.chat.completions.create({
      model: env.openaiModel,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mimeType};base64,${input.imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text:
                "识别图片中的销售单或采购单表格。只返回 JSON，格式为 {\"date\":\"YYYY-MM-DD\",\"items\":[{\"code\":\"\",\"name\":\"\",\"unit\":\"\",\"qty\":0,\"price\":0,\"amount\":0,\"remark\":\"\"}]}。",
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message.content ?? "{}";
    return normalizeExtraction(extractionResultSchema.parse(JSON.parse(content)));
  }
}
