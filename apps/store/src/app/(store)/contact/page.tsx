import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, Mail, MapPin, MessageCircle, Phone, Navigation } from "lucide-react";
import { getLiveKitchenStatus, getPublicHours, getPublicSettings } from "@/features/business-settings/queries";
import { HoursList } from "@/components/customer/hours-list";
import { KitchenStatusPill } from "@/components/shared/kitchen-status-pill";
import { getZonedParts } from "@/lib/utilities/time";

export const metadata: Metadata = { title: "Contact", description: "Get in touch with Bite Affairs, Kolkata." };

async function Contact() {
  const status = await getLiveKitchenStatus();
  const [settings, hours] = await Promise.all([getPublicSettings(), getPublicHours()]);
  const social = settings.social as Record<string, string | undefined>;
  const today = getZonedParts(new Date(), hours.timezone).weekday;
  const channels = [
    settings.contactPhone && { href: `tel:+91${settings.contactPhone}`, label: "Call us", value: `+91 ${settings.contactPhone}`, icon: Phone },
    settings.contactWhatsapp && { href: `https://wa.me/91${settings.contactWhatsapp}`, label: "WhatsApp", value: `+91 ${settings.contactWhatsapp}`, icon: MessageCircle },
    settings.contactEmail && { href: `mailto:${settings.contactEmail}`, label: "Email", value: settings.contactEmail, icon: Mail },
    social.googleMaps && { href: social.googleMaps, label: "Find us", value: "Open in Google Maps", icon: Navigation },
  ].filter(Boolean) as { href: string; label: string; value: string; icon: typeof Phone }[];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-4">
        <KitchenStatusPill status={status} />
        {channels.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {channels.map((c) => (
              <a key={c.label} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="group rounded-[2rem] border border-border bg-card p-6 transition hover:border-gold/40">
                <c.icon className="size-6 text-gold" />
                <p className="mt-4 text-sm text-muted-foreground">{c.label}</p>
                <p className="font-bold break-all group-hover:text-gold">{c.value}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="rounded-[2rem] border border-border bg-card p-6 text-sm text-muted-foreground">
            Contact details will appear here soon. In the meantime, you can{" "}
            <Link href="/menu" className="font-bold text-gold">
              order online
            </Link>
            .
          </p>
        )}
        <div className="rounded-[2rem] border border-border bg-card p-6 text-sm">
          <MapPin className="size-6 text-gold" />
          <p className="mt-3 font-bold">Cloud kitchen</p>
          <p className="text-muted-foreground">
            {settings.addressLine ? `${settings.addressLine}, ` : ""}
            {settings.city}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">We&apos;re a delivery-first kitchen. Pickup is available when enabled at checkout.</p>
        </div>
      </div>
      <div className="rounded-[2rem] border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <Clock className="size-5 text-gold" /> Opening hours
        </h2>
        <HoursList hours={hours} today={today} />
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <div className="container-page py-10">
      <p className="script-accent text-2xl">Say hello</p>
      <h1 className="display-heading mb-8 text-5xl sm:text-7xl">
        Contact <span className="gold-text">Us</span>
      </h1>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-[2rem] bg-muted" />}>
        <Contact />
      </Suspense>
    </div>
  );
}
