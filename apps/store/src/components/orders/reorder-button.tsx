"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { prepareReorder } from "@/features/account/actions";
import { cart } from "@/features/cart/cart-store";
import { Button } from "@/components/ui/button";

export function ReorderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      className="rounded-full font-bold"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const res = await prepareReorder(orderId);
        setLoading(false);
        if (!res.ok) return void toast.error(res.error);
        const { lines, issues } = res.data;
        for (const l of lines) cart.add(l);
        if (issues.length) toast.warning(`${issues.length} item${issues.length > 1 ? "s" : ""} couldn't be added`, { description: issues.join(" ") });
        if (lines.length) {
          toast.success(`${lines.length} item${lines.length > 1 ? "s" : ""} added to your cart at today's prices`);
          router.push("/cart");
        }
      }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reorder
    </Button>
  );
}
