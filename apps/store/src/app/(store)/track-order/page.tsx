import type { Metadata } from "next";
import { TrackLookupForm } from "@/components/orders/track-lookup-form";

export const metadata: Metadata = { title: "Track your order", description: "Track your Bite Affairs order in real time." };

export default function TrackLookupPage() {
  return (
    <div className="container-page pt-8 pb-10">
      <p className="script-accent text-2xl">Where&apos;s my food?</p>
      <h1 className="display-heading mb-8 text-5xl sm:text-6xl">
        Track <span className="gold-text">Order</span>
      </h1>
      <TrackLookupForm />
    </div>
  );
}
