import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/customer/legal-page";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="31 October 2026">
      <p>These terms apply to orders placed with Bite Affairs, a cloud kitchen in Kolkata, through this website. By placing an order you agree to them.</p>
      <h2>Orders</h2>
      <ul>
        <li>An order is confirmed only when our kitchen accepts it. We may decline an order (for example, if an item runs out or your address is outside our delivery area) and will tell you why.</li>
        <li>Prices, availability and delivery charges are those shown at checkout and are calculated by our system at the time you order.</li>
        <li>Pre-orders are prepared for the time slot you choose; timings are estimates.</li>
      </ul>
      <h2>Delivery and pickup</h2>
      <ul>
        <li>We deliver only to the PIN codes and areas listed as serviceable at checkout. Our own team delivers your food.</li>
        <li>Estimated preparation and delivery times may vary with traffic, weather and order volume.</li>
        <li>Please make sure someone is available at the address and reachable on the mobile number provided.</li>
      </ul>
      <h2>Payment</h2>
      <ul>
        <li>Cash on Delivery: please pay the total shown on your order when you receive it.</li>
        <li>Online payment (when available) is processed securely by Razorpay. Orders that remain unpaid are cancelled automatically.</li>
      </ul>
      <h2>Cancellations and refunds</h2>
      <ul>
        <li>Because food is cooked fresh, orders can&apos;t be changed once preparation starts. Please <Link href="/contact" className="text-gold underline">contact us</Link> as soon as possible if you need to cancel.</li>
        <li>If we cancel or reject a prepaid order, the full amount is refunded to the original payment method. Bank processing times apply.</li>
        <li>If something is wrong with your order, contact us within 24 hours with your order number and we&apos;ll make it right.</li>
      </ul>
      <h2>Allergens and dietary information</h2>
      <p>Veg/non-veg markers are shown for every dish. Our kitchen handles common allergens (including gluten, dairy, soy, nuts and eggs), so we cannot guarantee any dish is allergen-free. Tell us about allergies in the order notes.</p>
      <h2>Accounts and reviews</h2>
      <p>Keep your password confidential. Reviews must be honest and relate to food you ordered; we may moderate or remove reviews that are abusive or irrelevant.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India, with courts in Kolkata, West Bengal having jurisdiction.</p>
    </LegalPage>
  );
}
