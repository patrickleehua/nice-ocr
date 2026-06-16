import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Database,
  FileImage,
  FileInput,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  Table2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function AppShell({ children }: { children: React.ReactNode }) {
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
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-white"
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
            <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary">
              <option>2024-06 销售单据批次</option>
              <option>2024-05 采购单据批次</option>
              <option>历史导入批次-2024</option>
            </select>
            <div className="hidden h-9 w-72 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground md:flex">
              <Search size={15} />
              <span>搜索批次、图片、产品名</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <span className="h-2 w-2 rounded-full bg-success" />
              Worker 在线
            </div>
            <Button size="sm" variant="primary">
              <Upload size={15} />
              上传图片
            </Button>
            <Button size="icon" variant="ghost" aria-label="任务队列">
              <ListChecks size={16} />
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-4">{children}</main>
      </div>
    </div>
  );
}
