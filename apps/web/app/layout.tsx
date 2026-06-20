import type { Metadata } from "next";
import { ApiBaseScript } from "@/app/api-base-script";
import { ApiCacheProvider } from "@/lib/apiCache";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们的回忆",
  description: "只属于两个人的私密地图与纪念日墙。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="antialiased"
    >
      <body className="flex flex-col">
        <ApiBaseScript />
        <ApiCacheProvider>{children}</ApiCacheProvider>
      </body>
    </html>
  );
}
