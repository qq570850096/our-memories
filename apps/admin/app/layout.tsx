import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Our Memories Admin",
  description: "管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
