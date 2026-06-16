import { Save, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">配置识别策略、AI provider、队列重试和校验规则。</p>
        </div>
        <Button size="sm" variant="primary"><Save size={15} />保存设置</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader><PanelTitle>识别策略</PanelTitle></PanelHeader>
          <div className="space-y-4 p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">默认模式</span>
              <select className="h-9 w-full rounded-md border border-border bg-surface px-3">
                <option>balanced：风险触发二次识别</option>
                <option>fast：单次识别</option>
                <option>consensus：全量多次识别</option>
                <option>manual：人工导入/录入</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">金额容差</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="0.01" />
            </label>
          </div>
        </Panel>

        <Panel>
          <PanelHeader><PanelTitle>OpenAI 兼容 Provider</PanelTitle></PanelHeader>
          <div className="space-y-4 p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Base URL</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="https://api.openai.com/v1" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">模型</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="gpt-4o" />
            </label>
            <Button size="sm" variant="secondary"><TestTube2 size={15} />测试连接</Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader><PanelTitle>队列</PanelTitle></PanelHeader>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">并发数</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="3" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">最大重试</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="3" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">退避秒数</span>
              <input className="h-9 w-full rounded-md border border-border px-3" defaultValue="30" />
            </label>
          </div>
        </Panel>
      </div>
    </div>
  );
}
