function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  /** AES-256-GCM 主密钥（base64 的 32 字节），用于 provider apiKey 静态加密。未设置时无法保存新 Key。 */
  providerKeyEncryptionKey: process.env.PROVIDER_KEY_ENCRYPTION_KEY,
  /** worker 并发处理 job 的上限（重叠 AI HTTP 等待以提升吞吐）。 */
  workerConcurrency: intFromEnv(process.env.WORKER_CONCURRENCY, 3, 1, 12),
  /** 超过该时长仍为 active 的 job 视为孤儿（worker 崩溃残留），由 reaper 重置回 queued。 */
  staleJobMs: intFromEnv(process.env.WORKER_STALE_JOB_MS, 300_000, 30_000, 3_600_000),
};
