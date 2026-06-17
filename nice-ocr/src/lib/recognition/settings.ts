import type { AiProviderConfig } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { normalizeApprovalMode, type ApprovalMode } from "@/lib/recognition/review";

export const supportedProviderProtocols = ["openai_responses", "anthropic_messages"] as const;

export type ProviderProtocol = (typeof supportedProviderProtocols)[number];

/** 内置默认提示词；provider 未覆盖、全局也未设置时回退到此。 */
export const defaultRecognitionPrompts = {
  systemPrompt:
    "识别图片中的副食品销售单或采购单表格。提取单据日期和明细行。不要输出解释，只按结构化 schema 返回 date 和 items；无法识别的字段用空字符串或 0。",
  userPrompt: "请抽取这张单据图片中的日期和所有表格明细行。",
} as const;

export interface RecognitionDefaults {
  strategy: "fast" | "balanced" | "consensus" | "manual";
  approvalMode: ApprovalMode;
  amountTolerance: number;
  queueConcurrency: number;
  maxAttempts: number;
  backoffSeconds: number;
  /** 双模型交叉验证：pass1 主模型 / pass2 副模型（providerKey，空则按优先级回退）。 */
  primaryProviderKey: string | null;
  secondaryProviderKey: string | null;
  /** 全局默认识别提示词。 */
  systemPrompt: string;
  userPrompt: string;
  /** 审核(二次复查)：抽样比例(0..1，对干净 ai_auto 行额外 AI 复核) 与审核 provider。 */
  auditSampleRate: number;
  auditProviderKey: string | null;
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
  systemPrompt: string | null;
  userPrompt: string | null;
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
  systemPrompt?: string | null;
  userPrompt?: string | null;
  metadataJson?: string;
}

export interface RecognitionSettingsPayload {
  defaults: RecognitionDefaults;
  providers: SafeAiProviderConfig[];
}

export const recognitionDefaults: RecognitionDefaults = {
  strategy: "balanced",
  approvalMode: "hybrid",
  amountTolerance: 0.01,
  queueConcurrency: 3,
  maxAttempts: 3,
  backoffSeconds: 30,
  primaryProviderKey: null,
  secondaryProviderKey: null,
  systemPrompt: defaultRecognitionPrompts.systemPrompt,
  userPrompt: defaultRecognitionPrompts.userPrompt,
  auditSampleRate: 0.1,
  auditProviderKey: null,
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
    systemPrompt: normalized.systemPrompt,
    userPrompt: normalized.userPrompt,
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

export interface RecognitionProviderPair {
  primary: AiProviderConfig;
  /** 副模型；未配置或与主相同时退化为 primary（即单模型双跑）。 */
  secondary: AiProviderConfig;
  defaults: RecognitionDefaults;
}

/**
 * 解析一个批次实际使用的主/副识别 provider（双模型交叉验证）。
 * 优先级：批次显式指定 > 设置页全局默认 > 按优先级回退到已启用 provider。
 * 副模型缺省时自动选一个与主模型不同的已启用 provider；没有别的可用则退化为主模型双跑。
 */
export async function resolveRecognitionProviders(
  batch: { primaryProviderKey?: string | null; secondaryProviderKey?: string | null } = {},
): Promise<RecognitionProviderPair> {
  const defaults = parseRecognitionDefaults(
    (await prisma.appSetting.findUnique({ where: { key: recognitionDefaultsKey } }))?.valueJson,
  );
  const enabled = await prisma.aiProviderConfig.findMany({
    where: { enabled: true, AND: [{ apiKey: { not: null } }, { apiKey: { not: "" } }] },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (enabled.length === 0) {
    throw new Error("No enabled AI provider with an API key is configured in the database settings");
  }

  const byKey = new Map(enabled.map((provider) => [provider.providerKey, provider]));
  const pick = (key?: string | null) => (key ? byKey.get(key) ?? null : null);

  const primary = pick(batch.primaryProviderKey) ?? pick(defaults.primaryProviderKey) ?? enabled[0];
  const secondary =
    pick(batch.secondaryProviderKey) ??
    pick(defaults.secondaryProviderKey) ??
    enabled.find((provider) => provider.id !== primary.id) ??
    primary;

  return { primary, secondary, defaults };
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
    systemPrompt: provider.systemPrompt,
    userPrompt: provider.userPrompt,
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
    systemPrompt: normalizePromptString(input.systemPrompt),
    userPrompt: normalizePromptString(input.userPrompt),
    metadataJson: normalizeJsonObjectString(input.metadataJson),
  };
}

/** 提示词覆盖：空字符串视为“未覆盖”→ null（识别时回退全局默认）。 */
function normalizePromptString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
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
    approvalMode: normalizeApprovalMode(input.approvalMode),
    amountTolerance: clampNumber(input.amountTolerance, 0, 100, recognitionDefaults.amountTolerance),
    queueConcurrency: clampInt(input.queueConcurrency, 1, 12, recognitionDefaults.queueConcurrency),
    maxAttempts: clampInt(input.maxAttempts, 1, 10, recognitionDefaults.maxAttempts),
    backoffSeconds: clampInt(input.backoffSeconds, 1, 3600, recognitionDefaults.backoffSeconds),
    primaryProviderKey: normalizePromptString(input.primaryProviderKey),
    secondaryProviderKey: normalizePromptString(input.secondaryProviderKey),
    systemPrompt: normalizeOptionalString(input.systemPrompt) ?? recognitionDefaults.systemPrompt,
    userPrompt: normalizeOptionalString(input.userPrompt) ?? recognitionDefaults.userPrompt,
    auditSampleRate: clampNumber(input.auditSampleRate, 0, 1, recognitionDefaults.auditSampleRate),
    auditProviderKey: normalizePromptString(input.auditProviderKey),
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
