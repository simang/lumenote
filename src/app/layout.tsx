import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumenote",
  description: "Tolaria Markdown vault publishing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
