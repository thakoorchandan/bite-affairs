import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page pt-8 pb-10">
      <h1 className="display-heading mb-8 text-5xl sm:text-6xl">
        Your <span className="gold-text">Cart</span>
      </h1>
      <CartView />
    </div>
  );
}
