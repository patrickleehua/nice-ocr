/**
 * 共享 API 路径常量。
 *
 * 前端请求 URL 必须与后端路由定义完全一致，集中在此处避免前后端漂移。
 */
export const apiPaths = {
  dashboardSummary: "/api/dashboard/summary",
  batches: "/api/batches",
  batch: (id: string) => `/api/batches/${id}`,
  batchUpload: (id: string) => `/api/batches/${id}/upload`,
  rows: "/api/rows",
  row: (id: string) => `/api/rows/${id}`,
  rowsBulkConfirm: "/api/rows/bulk-confirm",
  document: (id: string) => `/api/documents/${id}`,
  documentImage: (id: string) => `/api/documents/${id}/image`,
  documentRetry: (id: string) => `/api/documents/${id}/retry`,
  products: "/api/products",
  product: (id: string) => `/api/products/${id}`,
  productsRebuild: "/api/products/rebuild",
  conflicts: "/api/conflicts",
  conflict: (id: string) => `/api/conflicts/${id}`,
  exportsRecognition: "/api/exports/recognition",
  exportsProducts: "/api/exports/products",
  importV5: "/api/import/v5",
  settings: "/api/settings",
  providerTest: (id: string) => `/api/settings/providers/${id}/test`,
} as const;
