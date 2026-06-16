export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
};
