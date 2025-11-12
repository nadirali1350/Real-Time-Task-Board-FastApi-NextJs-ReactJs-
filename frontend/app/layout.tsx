import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Task Board - Collaborative Project Management",
  description: "Real-time collaborative task board with drag-and-drop",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
