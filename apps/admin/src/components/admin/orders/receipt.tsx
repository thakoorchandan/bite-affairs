import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { selectionsOf } from "./types";
import type { AdminOrderDetail } from "@/services/admin-orders.service";

/** Print-only kitchen/customer receipt (shown via window.print()). */
export function PrintableReceipt({ order, businessName, phone, gstin, fssai }: { order: AdminOrderDetail["order"]; businessName: string; phone?: string | null; gstin?: string | null; fssai?: string | null }) {
  const p = order.pricing;
  return (
    <section className="hidden bg-white p-4 font-mono text-[12px] leading-snug text-black print:block" aria-hidden>
      <div className="text-center">
        <p className="text-lg font-bold">{businessName}</p>
        {phone && <p>Ph: {phone}</p>}
        {gstin && <p>GSTIN: {gstin}</p>}
        {fssai && <p>FSSAI: {fssai}</p>}
      </div>
      <hr className="my-2 border-dashed border-black" />
      <p>
        Order: <b>{order.orderNumber}</b>
      </p>
      <p>Date: {formatInZone(order.createdAt)}</p>
      <p>
        {order.fulfilment === "PICKUP" ? "PICKUP" : "DELIVERY"} · {order.payment.method === "COD" ? "Cash on Delivery" : "Paid online"}
      </p>
      <p>Customer: {order.customer.name} · {order.customer.phone}</p>
      {order.address && (
        <p>
          {[order.address.houseNumber, order.address.street, order.address.landmark, order.address.city, order.address.pincode].filter(Boolean).join(", ")}
        </p>
      )}
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full">
        <tbody>
          {order.items.map((i, idx) => (
            <tr key={idx} className="align-top">
              <td className="pr-2">{i.quantity}×</td>
              <td className="w-full">
                {i.name}
                {selectionsOf(i).map((s, si) => (
                  <div key={si} className="pl-2 text-[11px]">
                    + {(s.options ?? []).map((o) => o.name).join(", ")}
                  </div>
                ))}
                {i.notes && <div className="pl-2 text-[11px] italic">Note: {i.notes}</div>}
              </td>
              <td className="text-right whitespace-nowrap">{formatINR(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <Row label="Subtotal" value={formatINR(p.subtotal)} />
      {p.couponDiscount > 0 && <Row label={`Coupon ${p.couponCode ?? ""}`} value={`-${formatINR(p.couponDiscount)}`} />}
      {order.fulfilment === "DELIVERY" && <Row label="Delivery" value={p.deliveryFee ? formatINR(p.deliveryFee) : "Free"} />}
      {p.tax > 0 && <Row label={p.taxInclusive ? "Tax (included)" : "Tax"} value={formatINR(p.tax)} />}
      <Row label="TOTAL" value={formatINR(p.total)} bold />
      {order.customerNotes && <p className="mt-2">Instructions: {order.customerNotes}</p>}
      <p className="mt-3 text-center">Thank you! Good Food. Good Mood.</p>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-sm font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
