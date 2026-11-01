import type { Metadata } from "next";
import { Anton, Kaushan_Script, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Same three fonts as the storefront: the shared stylesheet and Logo expect --font-display / --font-script.
const display = Anton({ variable: "--font-display", weight: "400", subsets: ["latin"], display: "swap" });
const script = Kaushan_Script({ variable: "--font-script", weight: "400", subsets: ["latin"], display: "swap" });
const body = Manrope({ variable: "--font-body", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Bite Affairs Admin" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`dark ${display.variable} ${script.variable} ${body.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) add attributes to <body> before React loads. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster theme="dark" position="top-center" richColors closeButton toastOptions={{ classNames: { toast: "!bg-popover !border-border" } }} />
      </body>
    </html>
  );
}