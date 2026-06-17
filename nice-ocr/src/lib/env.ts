export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  storageDir: process.env.STORAGE_DIR ?? "./storage",
};
