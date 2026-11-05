import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./connected.css";
import "./workspace.css";
import "./retrieval.css";

export const metadata: Metadata = {
  title: "PIOS — Personal Intelligence OS",
  description: "A connected workspace for knowledge, learning and work.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
