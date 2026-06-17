"use client";

import { CheckCircle2, Plus, Save, TestTube2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiJson } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Protocol = "openai_responses" | "anthropic_messages";
type Strategy = "fast" | "balanced" | "consensus" | "manual";

type ApprovalMode = "manual" | "hybrid" | "auto";

interface SettingsPayload {
  defaults: {
    strategy: Strategy;
    approvalMode: ApprovalMode;
    amountTolerance: number;
    queueConcurrency: number;
    maxAttempts: number;
    backoffSeconds: number;
  };
  providers: ProviderForm[];
}

interface ProviderForm {
  id?: string;
  providerKey: string;
  displayName: string;
  protocol: Protocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
  priority: number;
  temperature: number | null;
  maxOutputTokens: number;
  metadataJson: string;
  hasApiKey?: boolean;
  apiKey?: string;
}

const protocolOptions: Array<{ value: Protocol; label: string }> = [
  { value: "openai_responses", label: "OpenAI Responses" },
  { value: "anthropic_messages", label: "Anthropic Messages" },
];

const defaultProvider: ProviderForm = {
  providerKey: "custom-provider",
  displayName: "自定义 Provider",
  protocol: "openai_responses",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1",
  enabled: false,
  priority: 100,
  temperature: null,
  maxOutputTokens: 2000,
  metadataJson: "{}",
};

export function SettingsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsPayload>("/api/settings"),
  });
  const [draft, setDraft] = useState<SettingsPayload | null>(null);
  const [syncedFrom, setSyncedFrom] = useState<SettingsPayload | null>(null);
  const [testState, setTestState] = useState<Record<string, string>>({});

  // 渲染期同步：拉到新设置时初始化可编辑副本，避免在 effect 内 setState 触发级联渲染。
  if (data && data !== syncedFrom) {
    setSyncedFrom(data);
    setDraft({
      defaults: data.defaults,
      providers: data.providers.map((provider) => ({ ...provider, apiKey: "" })),
    });
  }

  const enabledCount = useMemo(() => draft?.providers.filter((provider) => provider.enabled).length ?? 0, [draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: SettingsPayload) =>
      apiJson<SettingsPayload>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          defaults: payload.defaults,
          providers: payload.providers.map((provider) => ({
            ...provider,
            apiKey: provider.apiKey?.trim() ? provider.apiKey : undefined,
          })),
        }),
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  if (isLoading || !draft) {
    return <div className="text-sm text-muted-foreground">加载设置中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">配置识别策略、AI provider、队列重试和校验规则。</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={enabledCount > 0 ? "success" : "danger"}>{enabledCount} 个启用</Badge>
          <Button size="sm" variant="primary" onClick={() => saveMutation.mutate(draft)}>
            <Save size={15} />保存设置
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader><PanelTitle>识别策略</PanelTitle></PanelHeader>
          <div className="space-y-4 p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">默认模式</span>
              <select
                className="h-9 w-full rounded-md border border-border bg-surface px-3"
                value={draft.defaults.strategy}
                onChange={(event) => updateDefaults("strategy", event.target.value as Strategy)}
              >
                <option value="balanced">balanced：风险触发二次识别</option>
                <option value="fast">fast：单次识别</option>
                <option value="consensus">consensus：全量多次识别</option>
                <option value="manual">manual：人工导入/录入</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">默认审批模式（新建批次继承）</span>
              <select
                className="h-9 w-full rounded-md border border-border bg-surface px-3"
                value={draft.defaults.approvalMode}
                onChange={(event) => updateDefaults("approvalMode", event.target.value as ApprovalMode)}
              >
                <option value="manual">全人工：所有行人工确认</option>
                <option value="hybrid">混合：双次一致+低风险自动通过，其余转人工</option>
                <option value="auto">AI自动：双次一致即自动通过，高风险转人工</option>
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField label="金额容差" value={draft.defaults.amountTolerance} onChange={(value) => updateDefaults("amountTolerance", value)} />
              <NumberField label="并发数" value={draft.defaults.queueConcurrency} onChange={(value) => updateDefaults("queueConcurrency", value)} />
              <NumberField label="最大重试" value={draft.defaults.maxAttempts} onChange={(value) => updateDefaults("maxAttempts", value)} />
              <NumberField label="退避秒数" value={draft.defaults.backoffSeconds} onChange={(value) => updateDefaults("backoffSeconds", value)} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <div className="flex items-center justify-between gap-3">
              <PanelTitle>AI Provider</PanelTitle>
              <Button size="sm" variant="secondary" onClick={addProvider}>
                <Plus size={15} />新增
              </Button>
            </div>
          </PanelHeader>
          <div className="space-y-4 p-4">
            {draft.providers.map((provider, index) => (
              <div key={provider.id ?? provider.providerKey} className="rounded-md border border-border bg-surface p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className={provider.enabled ? "text-success" : "text-muted-foreground"} />
                    <span className="text-sm font-medium">{provider.displayName || provider.providerKey}</span>
                    <Badge>{provider.protocol}</Badge>
                    {provider.hasApiKey ? <Badge tone="success">已配置密钥</Badge> : <Badge tone="danger">未配置密钥</Badge>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(event) => updateProvider(index, { enabled: event.target.checked })}
                    />
                    启用
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Provider Key" value={provider.providerKey} onChange={(value) => updateProvider(index, { providerKey: value })} />
                  <TextField label="显示名称" value={provider.displayName} onChange={(value) => updateProvider(index, { displayName: value })} />
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">协议</span>
                    <select
                      className="h-9 w-full rounded-md border border-border bg-background px-3"
                      value={provider.protocol}
                      onChange={(event) => updateProvider(index, defaultProtocolPatch(event.target.value as Protocol))}
                    >
                      {protocolOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <TextField label="Base URL" value={provider.baseUrl} onChange={(value) => updateProvider(index, { baseUrl: value })} />
                  <TextField label="模型" value={provider.model} onChange={(value) => updateProvider(index, { model: value })} />
                  <TextField label="API Key" type="password" value={provider.apiKey ?? ""} placeholder={provider.hasApiKey ? "留空则保留当前密钥" : "输入 API Key"} onChange={(value) => updateProvider(index, { apiKey: value })} />
                  <NumberField label="优先级" value={provider.priority} onChange={(value) => updateProvider(index, { priority: value })} />
                  <NumberField label="最大输出 Tokens" value={provider.maxOutputTokens} onChange={(value) => updateProvider(index, { maxOutputTokens: value })} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => testProvider(provider)}>
                    <TestTube2 size={15} />测试连接
                  </Button>
                  {testState[provider.id ?? provider.providerKey] ? (
                    <span className="text-xs text-muted-foreground">{testState[provider.id ?? provider.providerKey]}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );

  function updateDefaults<K extends keyof SettingsPayload["defaults"]>(key: K, value: SettingsPayload["defaults"][K]) {
    setDraft((current) => current ? { ...current, defaults: { ...current.defaults, [key]: value } } : current);
  }

  function updateProvider(index: number, patch: Partial<ProviderForm>) {
    setDraft((current) => {
      if (!current) return current;
      const providers = current.providers.slice();
      providers[index] = { ...providers[index], ...patch };
      return { ...current, providers };
    });
  }

  function addProvider() {
    setDraft((current) => current ? { ...current, providers: [...current.providers, { ...defaultProvider, providerKey: `provider-${current.providers.length + 1}` }] } : current);
  }

  async function testProvider(provider: ProviderForm) {
    if (!provider.id) {
      setTestState((current) => ({ ...current, [provider.providerKey]: "请先保存后测试" }));
      return;
    }
    setTestState((current) => ({ ...current, [provider.id!]: "测试中..." }));
    try {
      const result = await apiJson<{ ok: boolean; latencyMs: number }>(`/api/settings/providers/${provider.id}/test`, { method: "POST" });
      setTestState((current) => ({ ...current, [provider.id!]: `连接正常 ${result.latencyMs}ms` }));
    } catch (error) {
      setTestState((current) => ({ ...current, [provider.id!]: error instanceof Error ? error.message : String(error) }));
    }
  }
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-border bg-background px-3"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-border bg-background px-3"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function defaultProtocolPatch(protocol: Protocol): Partial<ProviderForm> {
  if (protocol === "anthropic_messages") {
    return { protocol, baseUrl: "https://api.anthropic.com", model: "claude-opus-4-6" };
  }
  return { protocol, baseUrl: "https://api.openai.com/v1", model: "gpt-4.1" };
}
