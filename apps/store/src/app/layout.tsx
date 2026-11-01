import type { Metadata, Viewport } from "next";
import { Anton, Kaushan_Script, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BRAND } from "@/constants/domain";
import "./globals.css";

const display = Anton({ variable: "--font-display", weight: "400", subsets: ["latin"], display: "swap" });
const script = Kaushan_Script({ variable: "--font-script", weight: "400", subsets: ["latin"], display: "swap" });
const body = Manrope({ variable: "--font-body", subsets: ["latin"], display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.name} is a cloud kitchen in ${BRAND.city} serving Indo-Chinese favourites, pizzas, burgers, momos and more, delivered by us. ${BRAND.secondaryTagline}`,
  applicationName: BRAND.name,
  openGraph: { type: "website", siteName: BRAND.name, locale: "en_IN", images: ["/images/menu/pizza.webp"] },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
