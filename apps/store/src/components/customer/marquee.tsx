export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-gold/20 bg-gold py-3 text-primary-foreground" aria-hidden>
      <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-8 motion-reduce:animate-none">
        {row.map((item, i) => (
          <span key={i} className="display-heading flex items-center gap-8 text-xl whitespace-nowrap sm:text-2xl">
            {item}
            <span className="text-base">✦</span>
          </span>
        ))}
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}
