import {
  BarChart3,
  Bell,
  Bike,
  ChefHat,
  Clock,
  CreditCard,
  FileText,
  FolderTree,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquareQuote,
  Receipt,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Tag,
  UtensilsCrossed,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Key into live status counts to show a badge (e.g. new orders). */
  badge?: "new" | "ready";
}

export const ADMIN_NAV: { section: string; items: AdminNavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/orders", label: "Orders", icon: ShoppingBag, badge: "new" },
      { href: "/kitchen-display", label: "Kitchen Display", icon: ChefHat },
      { href: "/deliveries", label: "Deliveries", icon: Bike, badge: "ready" },
      { href: "/payments", label: "Payments", icon: CreditCard },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    section: "Menu",
    items: [
      { href: "/menu", label: "Menu Overview", icon: UtensilsCrossed },
      { href: "/categories", label: "Categories", icon: FolderTree },
      { href: "/products", label: "Products", icon: ListChecks },
      { href: "/customisations", label: "Customisations", icon: SlidersHorizontal },
      { href: "/media", label: "Media Library", icon: ImageIcon },
    ],
  },
  {
    section: "Growth",
    items: [
      { href: "/coupons", label: "Coupons", icon: Tag },
      { href: "/reviews", label: "Reviews", icon: MessageSquareQuote },
      { href: "/website-content", label: "Website Content", icon: FileText },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/expenses", label: "Expenses & Profit", icon: Wallet },
      { href: "/business-hours", label: "Business Hours", icon: Clock },
      { href: "/delivery-settings", label: "Delivery Settings", icon: MapPin },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/activity-logs", label: "Activity Logs", icon: History },
    ],
  },
];

export const ADMIN_NAV_FLAT = ADMIN_NAV.flatMap((s) => s.items);
export { Receipt };
