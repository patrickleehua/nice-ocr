"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Database,
  FileImage,
  FileInput,
  LayoutDashboard,
  Search,
  Settings,
  Table2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";

const navGroups = [
  {
    label: "工作区",
    items: [
      { href: "/", label: "仪表盘", icon: LayoutDashboard },
      { href: "/batches", label: "批次管理", icon: Boxes },
      { href: "/results", label: "全部结果", icon: Table2 },
      { href: "/review", label: "审核工作台", icon: FileImage },
    ],
  },
  {
    label: "数据",
    items: [
      { href: "/products", label: "产品库", icon: Database },
      { href: "/conflicts", label: "冲突管理", icon: AlertTriangle },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/import", label: "导入", icon: FileInput },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
];

interface BatchOption {
  id: string;
  name: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data: batchData } = useQuery<{ batches: BatchOption[] }>({
    queryKey: ["batches"],
    queryFn: () => apiGet(apiPaths.batches),
  });
  const { data: summary } = useQuery<{ metrics: { queued: number } }>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet(apiPaths.dashboardSummary),
  });

  const batches = batchData?.batches ?? [];
  const queued = summary?.metrics.queued ?? 0;
  const activeBatchId = batches[0]?.id;

  function submitSearch() {
    const q = search.trim();
    router.push(q ? `/results?name=${encodeURIComponent(q)}` : "/results");
  }

  return (
    <div className="flex min-h-screen bg-app text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            N
          </div>
          <div>
            <div className="text-sm font-semibold text-white">nice-ocr</div>
            <div className="text-[11px] text-sidebar-muted">智能单据识别</div>
          </div>
        </div>
        <nav className="space-y-5 px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 px-2 text-[11px] font-medium text-sidebar-muted">{group.label}</div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-hover text-white"
                          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-white",
                      )}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
          <div className="flex min-w-0 items-center gap-3">
            <select
              className="h-9 max-w-56 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              value=""
              onChange={(event) => {
                if (event.target.value) router.push(`/batches/${event.target.value}`);
              }}
            >
              <option value="">{batches.length ? "切换批次..." : "暂无批次"}</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
            <form
              className="hidden h-9 w-72 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm md:flex"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <Search size={15} className="text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索产品名/编码，回车跳转结果"
                className="h-full flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </form>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <span className={cn("h-2 w-2 rounded-full", queued > 0 ? "bg-warning" : "bg-success")} />
              {queued > 0 ? `队列处理中 ${queued}` : "队列空闲"}
            </div>
            <Button size="sm" variant="primary" asChild>
              <Link href={activeBatchId ? `/batches/${activeBatchId}` : "/batches"}>
                <Upload size={15} />
                上传图片
              </Link>
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-4">{children}</main>
      </div>
    </div>
  );
}
