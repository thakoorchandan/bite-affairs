import Link from "next/link";
import { connection } from "next/server";
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { InstagramIcon as Instagram, FacebookIcon as Facebook, YoutubeIcon as Youtube } from "@/components/customer/social-icons";
import { Logo } from "@/components/shared/logo";
import { getPublicSettings, getPublicHours } from "@/features/business-settings/queries";
import { getHomeContent } from "@/features/content/queries";
import { HoursList } from "@/components/customer/hours-list";
import { BRAND } from "@/constants/domain";

export async function SiteFooter() {
  await connection();
  const [settings, hours, content] = await Promise.all([getPublicSettings(), getPublicHours(), getHomeContent()]);
  const social = settings.social as Record<string, string | undefined>;
  const socials = [
    { href: social.instagram, label: "Instagram", icon: Instagram },
    { href: social.facebook, label: "Facebook", icon: Facebook },
    { href: social.youtube, label: "YouTube", icon: Youtube },
  ].filter((s) => s.href);
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-border bg-ink">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />
      <div className="container-page relative grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo className="text-3xl" />
          <p className="script-accent text-xl">{BRAND.secondaryTagline}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{content.footer?.blurb ?? BRAND.tagline}</p>
          {socials.length > 0 && (
            <div className="flex gap-2">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-gold hover:text-gold">
                  <s.icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold tracking-[0.2em] text-gold uppercase">Explore</h3>
          <ul className="grid gap-2 text-sm">
            {[
              ["/menu", "Full menu"],
              ["/track-order", "Track your order"],
              ["/account", "My account"],
              ["/about", "About us"],
              ["/contact", "Contact"],
              ["/privacy-policy", "Privacy policy"],
              ["/terms-and-conditions", "Terms & conditions"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-foreground/80 transition hover:text-gold">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold tracking-[0.2em] text-gold uppercase">Opening hours</h3>
          <HoursList hours={hours} className="text-xs" />
        </div>
        <div>
          <h3 className="mb-4 text-xs font-bold tracking-[0.2em] text-gold uppercase">Get in touch</h3>
          <ul className="grid gap-3 text-sm">
            {settings.contactPhone && (
              <li>
                <a href={`tel:+91${settings.contactPhone}`} className="flex items-center gap-2 hover:text-gold">
                  <Phone className="size-4 text-gold" /> +91 {settings.contactPhone}
                </a>
              </li>
            )}
            {settings.contactWhatsapp && (
              <li>
                <a href={`https://wa.me/91${settings.contactWhatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gold">
                  <MessageCircle className="size-4 text-gold" /> WhatsApp us
                </a>
              </li>
            )}
            {settings.contactEmail && (
              <li>
                <a href={`mailto:${settings.contactEmail}`} className="flex items-center gap-2 break-all hover:text-gold">
                  <Mail className="size-4 shrink-0 text-gold" /> {settings.contactEmail}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>{settings.addressLine ? `${settings.addressLine}, ` : ""}{settings.city}</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">Delivered by our own team — no marketplace middlemen.</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {content.footer?.copyright ?? BRAND.name}. All rights reserved.
          </p>
          <p className="flex flex-wrap gap-x-4">
            {settings.fssaiNumber && <span>FSSAI Lic. No. {settings.fssaiNumber}</span>}
            {settings.gstin && <span>GSTIN {settings.gstin}</span>}
          </p>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooterSkeleton() {
  return <div className="mt-24 h-80 border-t border-border bg-ink" aria-hidden />;
}
