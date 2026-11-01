import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/customer/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="31 October 2026">
      <p>
        Bite Affairs (&ldquo;we&rdquo;, &ldquo;us&rdquo;) runs a cloud kitchen in Kolkata, India. This policy explains what personal data we collect when you use this website, why we collect it and how we protect it, in line with India&apos;s Digital Personal Data Protection Act, 2023.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Contact details you give us: name, mobile number and (optionally) email.</li>
        <li>Delivery details: address, PIN code, landmark and delivery instructions.</li>
        <li>Order details: items, customisations, notes, amounts and payment status.</li>
        <li>Account details if you register: a securely hashed password (we never store your password in readable form), saved addresses and favourites.</li>
        <li>Basic technical data such as IP address, used only to protect the service against abuse (rate limiting).</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To prepare, deliver and support your orders, including calling you about a delivery.</li>
        <li>To send order status updates (on the website and, if enabled, by email or WhatsApp).</li>
        <li>To keep accurate business and tax records.</li>
      </ul>
      <p>We do not sell your data and we do not use it for third-party advertising.</p>
      <h2>Payments</h2>
      <p>Online payments, when offered, are processed by Razorpay. We never see or store your card or UPI credentials; we only receive a payment reference and status.</p>
      <h2>Storage and security</h2>
      <p>Data is stored with reputable cloud providers (MongoDB Atlas for data, Cloudinary for food images). Access to order and customer data is restricted to authorised kitchen staff, and administrative actions are logged.</p>
      <h2>Cookies and local storage</h2>
      <p>We use essential cookies to keep you signed in, and your browser&apos;s local storage to remember your cart, guest favourites and recent order tracking links. We don&apos;t use advertising cookies.</p>
      <h2>Your choices</h2>
      <ul>
        <li>You can order as a guest without creating an account.</li>
        <li>You can view and edit your profile and addresses in your account at any time.</li>
        <li>You can ask us to access, correct or delete your personal data by <Link href="/contact" className="text-gold underline">contacting us</Link>. We may keep order records where required by law.</li>
      </ul>
      <h2>Changes</h2>
      <p>We may update this policy. The date above shows the latest version.</p>
    </LegalPage>
  );
}
