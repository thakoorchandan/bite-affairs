import { connection } from "next/server";
import { getHomeContent } from "@/features/content/queries";

export async function AnnouncementBar() {
  await connection();
  const content = await getHomeContent();
  const text = content.announcement?.isActive ? content.announcement.text : null;
  if (!text) return null;
  return (
    <div className="bg-gold text-primary-foreground">
      <p className="container-page py-2 text-center text-xs font-bold tracking-wide sm:text-sm">{text}</p>
    </div>
  );
}
