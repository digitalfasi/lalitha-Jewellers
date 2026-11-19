import "./globals.css";
import AppHeader from "@/_shared/components/AppHeader";
import AuthProvider from "@/_shared/auth/AuthProvider";
import LanguageProvider from "@/_shared/i18n/LanguageProvider";

export const metadata = {
  title: "DFX Wholesale",
  description: "Billing and inventory for the wholesaler",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <LanguageProvider>
          <AuthProvider>
            <AppHeader />
            <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:pb-6 print:max-w-none print:p-0">{children}</main>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
