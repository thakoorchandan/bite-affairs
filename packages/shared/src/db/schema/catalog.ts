import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MediaKind } from "@/constants/domain";
import { createdAt, pk, type ImageRef, type VideoRef, updatedAt } from "./_columns";
import { users } from "./identity";

export const categories = pgTable(
  "categories",
  {
    id: pk(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    image: jsonb("image").$type<ImageRef | null>(),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    seo: jsonb("seo").$type<{ title?: string | null; description?: string | null } | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug), index("categories_active_order_idx").on(t.isActive, t.displayOrder)],
);

export const products = pgTable(
  "products",
  {
    id: pk(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
    /** Integer paise. */
    price: integer("price").notNull(),
    discountedPrice: integer("discounted_price"),
    image: jsonb("image").$type<ImageRef | null>(),
    gallery: jsonb("gallery").$type<ImageRef[]>().notNull().default(sql`'[]'::jsonb`),
    videos: jsonb("videos").$type<VideoRef[]>().notNull().default(sql`'[]'::jsonb`),
    isVeg: boolean("is_veg").notNull(),
    isBestseller: boolean("is_bestseller").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    isNewArrival: boolean("is_new_arrival").notNull().default(false),
    /** Inactive products are hidden entirely. */
    isActive: boolean("is_active").notNull().default(true),
    /** Sold out: visible but cannot be ordered. */
    isAvailable: boolean("is_available").notNull().default(true),
    preparationMinutes: integer("preparation_minutes").notNull().default(15),
    spiceLevel: integer("spice_level").notNull().default(0),
    servingInfo: text("serving_info"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    displayOrder: integer("display_order").notNull().default(0),
    seo: jsonb("seo").$type<{ title?: string | null; description?: string | null } | null>(),
    ratingAverage: doublePrecision("rating_average").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_category_idx").on(t.categoryId, t.isActive, t.displayOrder),
    index("products_active_available_idx").on(t.isActive, t.isAvailable),
    index("products_bestseller_idx").on(t.isActive, t.isBestseller),
    index("products_featured_idx").on(t.isActive, t.isFeatured),
    check("products_price_chk", sql`${t.price} >= 0 and (${t.discountedPrice} is null or ${t.discountedPrice} >= 0)`),
    check("products_spice_chk", sql`${t.spiceLevel} between 0 and 3`),
  ],
);

export const customisationGroups = pgTable("customisation_groups", {
  id: pk(),
  name: text("name").notNull(),
  /** Internal label to tell apart groups that share a customer-facing name. */
  internalName: text("internal_name"),
  selectionType: text("selection_type").$type<"SINGLE" | "MULTIPLE">().notNull().default("MULTIPLE"),
  isRequired: boolean("is_required").notNull().default(false),
  minSelect: integer("min_select").notNull().default(0),
  /** 0 = no limit (MULTIPLE only). */
  maxSelect: integer("max_select").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customisationOptions = pgTable(
  "customisation_options",
  {
    id: pk(),
    groupId: uuid("group_id").notNull().references(() => customisationGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Integer paise added to the unit price. */
    priceDelta: integer("price_delta").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    isVeg: boolean("is_veg").notNull().default(true),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("customisation_options_group_idx").on(t.groupId, t.position)],
);

export const productCustomisationGroups = pgTable(
  "product_customisation_groups",
  {
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => customisationGroups.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.groupId] }), index("pcg_group_idx").on(t.groupId)],
);

export const productMedia = pgTable(
  "product_media",
  {
    id: pk(),
    kind: text("kind").$type<MediaKind>().notNull(),
    publicId: text("public_id").notNull(),
    url: text("url").notNull(),
    format: text("format"),
    bytes: integer("bytes"),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: doublePrecision("duration_seconds"),
    originalFilename: text("original_filename"),
    alt: text("alt"),
    /** Content hash reported by Cloudinary; used to detect duplicate uploads. */
    etag: text("etag"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("product_media_public_id_uq").on(t.publicId), index("product_media_kind_idx").on(t.kind, t.createdAt), index("product_media_etag_idx").on(t.etag)],
);

export const productCosts = pgTable("product_costs", {
  productId: uuid("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  ingredientCost: integer("ingredient_cost").notNull().default(0),
  packagingCost: integer("packaging_cost").notNull().default(0),
  preparationCost: integer("preparation_cost").notNull().default(0),
  otherCost: integer("other_cost").notNull().default(0),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const favourites = pgTable(
  "favourites",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("favourites_user_product_uq").on(t.userId, t.productId), index("favourites_user_idx").on(t.userId, t.createdAt)],
);

export type CartItemRow = { key: string; productId: string; quantity: number; selections: { groupId: string; optionIds: string[] }[]; notes?: string | null };

/** Server copy of a signed-in customer's cart. Prices are never stored here. */
export const carts = pgTable("carts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<CartItemRow[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: pk(),
    orderId: uuid("order_id").notNull(),
    /** order_items.id of the reviewed line. */
    orderItemId: uuid("order_item_id").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    productName: text("product_name"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    customerName: text("customer_name"),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    status: text("status").$type<"PENDING" | "APPROVED" | "HIDDEN">().notNull().default("PENDING"),
    adminReply: text("admin_reply"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One review per ordered item.
    uniqueIndex("reviews_order_item_uq").on(t.orderId, t.orderItemId),
    index("reviews_product_status_idx").on(t.productId, t.status, t.createdAt),
    index("reviews_status_idx").on(t.status, t.createdAt),
    check("reviews_rating_chk", sql`${t.rating} between 1 and 5`),
  ],
);

export const testimonials = pgTable(
  "testimonials",
  {
    id: pk(),
    name: text("name").notNull(),
    location: text("location"),
    quote: text("quote").notNull(),
    rating: integer("rating").notNull().default(5),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("testimonials_active_idx").on(t.isActive, t.displayOrder)],
);
