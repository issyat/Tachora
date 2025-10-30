import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Rethink_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const rethinkSans = Rethink_Sans({
  variable: "--font-rethink",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tachora Scheduler",
  description: "Multi-store retail scheduling MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${rethinkSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-950`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
