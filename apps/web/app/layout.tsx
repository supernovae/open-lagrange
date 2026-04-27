import "./styles.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Open Lagrange",
  description: "Deterministic reconciliation around cognitive artifacts.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
