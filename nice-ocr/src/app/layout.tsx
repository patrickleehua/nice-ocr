import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nice-ocr",
  description: "副食品单据识别与审核工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
