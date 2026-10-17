import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "جودة أكاديمية ذكية — جامعة الباحة",
  description: "منصة متابعة اكتمال ملفات المقررات بكلية الحاسبات والمعلومات",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body>{children}</body>
    </html>
  );
}
