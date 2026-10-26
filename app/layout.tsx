import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { QueryProvider } from "@/components/QueryProvider";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";

export const metadata: Metadata = {
  title: { template: "%s · Hericilla Admin", default: "Hericilla Admin" },
  description: "Operations portal for Hericilla Support Services Limited.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <QueryProvider>
            <RecoveryRedirect />
            {children}
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
