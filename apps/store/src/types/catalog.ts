export interface ImageRef {
  url: string;
  publicId?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

export interface VideoRef {
  url: string;
  publicId?: string | null;
  posterUrl?: string | null;
  durationSeconds?: number | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: ImageRef | null;
  displayOrder: number;
  productCount: number;
}

export interface PublicCustomisationOption {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  isDefault: boolean;
  isVeg: boolean;
}

export interface PublicCustomisationGroup {
  id: string;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: PublicCustomisationOption[];
}

export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  price: number;
  discountedPrice?: number | null;
  image?: ImageRef | null;
  gallery: ImageRef[];
  videos: VideoRef[];
  isVeg: boolean;
  isBestseller: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  isAvailable: boolean;
  preparationMinutes: number;
  spiceLevel: number;
  servingInfo?: string | null;
  tags: string[];
  ratingAverage: number;
  ratingCount: number;
  hasCustomisations: boolean;
  seo?: { title?: string | null; description?: string | null } | null;
  createdAt: string;
}

export interface PublicProductDetail extends PublicProduct {
  customisationGroups: PublicCustomisationGroup[];
}
