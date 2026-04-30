import "./styles.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Kybern",
  description: "Kybern builds Synesis and Open Lagrange: self-hosted intelligence, agentic coding, graph-native knowledge, and bounded execution control.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
