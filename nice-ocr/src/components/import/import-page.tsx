import { Database, FileJson, FolderInput, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";

export function ImportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">导入 v5 数据</h1>
        <p className="mt-1 text-sm text-muted-foreground">导入 recognition-results、image-library、product-library 和历史图片。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader>
            <PanelTitle>导入文件</PanelTitle>
          </PanelHeader>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {[
              ["recognition-results.json", FileJson],
              ["image-library.json", FileJson],
              ["product-library.json", Database],
              ["uploads 图片目录", FolderInput],
            ].map(([label, Icon]) => {
              const FileIcon = Icon as typeof FileJson;
              return (
                <div key={label as string} className="rounded-lg border border-dashed border-border bg-muted p-5">
                  <FileIcon size={22} className="text-primary" />
                  <div className="mt-3 text-sm font-medium">{label as string}</div>
                  <div className="mt-1 text-xs text-muted-foreground">等待选择</div>
                  <Button className="mt-4" size="sm" variant="secondary"><UploadCloud size={15} />选择</Button>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>导入预览</PanelTitle>
          </PanelHeader>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">识别行</span><span>0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">图片记录</span><span>0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">产品记录</span><span>0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">缺失图片</span><span>0</span></div>
            <Button className="mt-3 w-full" variant="primary">开始导入</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
