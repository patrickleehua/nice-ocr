import type { AiProviderConfig } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export const supportedProviderProtocols = ["openai_responses", "anthropic_messages"] as const;

export type ProviderProtocol = (typeof supportedProviderProtocols)[number];

export interface RecognitionDefaults {
  strategy: "fast" | "balanced" | "consensus" | "manual";
  amountTolerance: number;
  queueConcurrency: number;
  maxAttempts: number;
  backoffSeconds: number;
}

export interface SafeAiProviderConfig {
  id: string;
  providerKey: string;
  displayName: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  priority: number;
  temperature: number | null;
  maxOutputTokens: number;
  metadataJson: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderConfigInput {
  id?: string;
  providerKey?: string;
  displayName?: string;
  protocol?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string;
  enabled?: boolean;
  priority?: number;
  temperature?: number | null;
  maxOutputTokens?: number;
  metadataJson?: string;
}

export interface RecognitionSettingsPayload {
  defaults: RecognitionDefaults;
  providers: SafeAiProviderConfig[];
}

export const recognitionDefaults: RecognitionDefaults = {
  strategy: "balanced",
  amountTolerance: 0.01,
  queueConcurrency: 3,
  maxAttempts: 3,
  backoffSeconds: 30,
};

const recognitionDefaultsKey = "recognition.defaults";

export function isProviderProtocol(value: string): value is ProviderProtocol {
  return supportedProviderProtocols.includes(value as ProviderProtocol);
}

export async function getRecognitionSettings(): Promise<RecognitionSettingsPayload> {
  const [setting, providers] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: recognitionDefaultsKey } }),
    prisma.aiProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
  ]);

  return {
    defaults: parseRecognitionDefaults(setting?.valueJson),
    providers: providers.map(toSafeProviderConfig),
  };
}

export async function updateRecognitionDefaults(input: Partial<RecognitionDefaults>) {
  const current = parseRecognitionDefaults(
    (await prisma.appSetting.findUnique({ where: { key: recognitionDefaultsKey } }))?.valueJson,
  );
  const next = normalizeRecognitionDefaults({ ...current, ...input });
  await prisma.appSetting.upsert({
    where: { key: recognitionDefaultsKey },
    create: { key: recognitionDefaultsKey, valueJson: JSON.stringify(next) },
    update: { valueJson: JSON.stringify(next) },
  });
  return next;
}

export async function upsertAiProviderConfig(input: AiProviderConfigInput) {
  const normalized = normalizeProviderInput(input);
  const apiKey = normalizeOptionalString(input.apiKey);
  const data = {
    providerKey: normalized.providerKey,
    displayName: normalized.displayName,
    protocol: normalized.protocol,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    enabled: normalized.enabled,
    priority: normalized.priority,
    temperature: normalized.temperature,
    maxOutputTokens: normalized.maxOutputTokens,
    metadataJson: normalized.metadataJson,
    ...(apiKey !== undefined ? { apiKey } : {}),
  };

  if (input.id) {
    return toSafeProviderConfig(
      await prisma.aiProviderConfig.update({
        where: { id: input.id },
        data,
      }),
    );
  }

  return toSafeProviderConfig(
    await prisma.aiProviderConfig.upsert({
      where: { providerKey: normalized.providerKey },
      create: {
        ...data,
        apiKey: apiKey ?? "",
      },
      update: data,
    }),
  );
}

export async function getActiveAiProviderConfig() {
  const provider = await prisma.aiProviderConfig.findFirst({
    where: {
      enabled: true,
      AND: [{ apiKey: { not: null } }, { apiKey: { not: "" } }],
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!provider) {
    throw new Error("No enabled AI provider with an API key is configured in the database settings");
  }
  return provider;
}

export function toSafeProviderConfig(provider: AiProviderConfig): SafeAiProviderConfig {
  return {
    id: provider.id,
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    protocol: toProtocol(provider.protocol),
    baseUrl: provider.baseUrl ?? "",
    model: provider.model,
    enabled: provider.enabled,
    priority: provider.priority,
    temperature: provider.temperature,
    maxOutputTokens: provider.maxOutputTokens,
    metadataJson: provider.metadataJson,
    hasApiKey: Boolean(provider.apiKey?.trim()),
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

function normalizeProviderInput(input: AiProviderConfigInput) {
  const providerKey = normalizeRequiredString(input.providerKey, "providerKey");
  const displayName = normalizeRequiredString(input.displayName, "displayName");
  const model = normalizeRequiredString(input.model, "model");
  const protocol = toProtocol(normalizeRequiredString(input.protocol, "protocol"));
  return {
    providerKey,
    displayName,
    protocol,
    baseUrl: normalizeOptionalString(input.baseUrl) ?? defaultBaseUrl(protocol),
    model,
    enabled: Boolean(input.enabled),
    priority: clampInt(input.priority, 1, 999, 100),
    temperature: input.temperature == null ? null : Number(input.temperature),
    maxOutputTokens: clampInt(input.maxOutputTokens, 256, 16000, 2000),
    metadataJson: normalizeJsonObjectString(input.metadataJson),
  };
}

function parseRecognitionDefaults(raw?: string | null): RecognitionDefaults {
  if (!raw) return recognitionDefaults;
  try {
    return normalizeRecognitionDefaults(JSON.parse(raw) as Partial<RecognitionDefaults>);
  } catch {
    return recognitionDefaults;
  }
}

function normalizeRecognitionDefaults(input: Partial<RecognitionDefaults>): RecognitionDefaults {
  const strategy = ["fast", "balanced", "consensus", "manual"].includes(String(input.strategy))
    ? (input.strategy as RecognitionDefaults["strategy"])
    : recognitionDefaults.strategy;
  return {
    strategy,
    amountTolerance: clampNumber(input.amountTolerance, 0, 100, recognitionDefaults.amountTolerance),
    queueConcurrency: clampInt(input.queueConcurrency, 1, 12, recognitionDefaults.queueConcurrency),
    maxAttempts: clampInt(input.maxAttempts, 1, 10, recognitionDefaults.maxAttempts),
    backoffSeconds: clampInt(input.backoffSeconds, 1, 3600, recognitionDefaults.backoffSeconds),
  };
}

function toProtocol(value: string): ProviderProtocol {
  if (!isProviderProtocol(value)) {
    throw new Error(`Unsupported AI provider protocol: ${value}`);
  }
  return value;
}

function defaultBaseUrl(protocol: ProviderProtocol) {
  return protocol === "anthropic_messages" ? "https://api.anthropic.com" : "https://api.openai.com/v1";
}

function normalizeRequiredString(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown) {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function normalizeJsonObjectString(value: unknown) {
  if (value == null || String(value).trim() === "") return "{}";
  const parsed = JSON.parse(String(value));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("metadataJson must be a JSON object");
  }
  return JSON.stringify(parsed);
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
