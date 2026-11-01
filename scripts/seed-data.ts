/**
 * Initial menu transcribed from the official Bite Affairs menu poster
 * (public/reference/bite-affairs-menu.jpg). Prices are in rupees here and converted to
 * paise by the seed script. Do not add items or change prices without the owner's input.
 *
 * Veg/non-veg is inferred from item names. "Fried Momo (6 pcs)" does not state its filling
 * on the menu, so it is conservatively marked non-veg — confirm in the admin panel.
 */
export interface SeedProduct {
  name: string;
  price: number;
  isVeg: boolean;
  shortDescription?: string;
  servingInfo?: string;
  image?: string;
  isFeatured?: boolean;
  addOnGroup?: string;
}

export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  image: string;
  products: SeedProduct[];
}

export const SEED_ADD_ON_GROUPS = {
  periPeri: {
    name: "Add-ons",
    internalName: "Fries add-ons",
    selectionType: "MULTIPLE" as const,
    isRequired: false,
    minSelect: 0,
    maxSelect: 0,
    options: [{ name: "Extra Peri Peri", price: 17, isVeg: true }],
  },
};

export const SEED_MENU: SeedCategory[] = [
  {
    name: "Sandwiches",
    slug: "sandwiches",
    description: "Toasted, grilled and generously filled.",
    image: "/images/menu/sandwiches.webp",
    products: [
      { name: "Corn Masala Sandwich", price: 155, isVeg: true, shortDescription: "Grilled sandwich with a spiced sweet corn filling." },
      { name: "Paneer Takatak Sandwich", price: 186, isVeg: true, shortDescription: "Grilled sandwich loaded with tangy, spiced paneer." },
      { name: "Veg Grills Sandwich", price: 174, isVeg: true, shortDescription: "Grilled sandwich packed with vegetables." },
      { name: "Chicken Sandwich", price: 205, isVeg: false, shortDescription: "Grilled sandwich with a chicken filling." },
      { name: "Mushroom Sandwich", price: 174, isVeg: true, shortDescription: "Grilled sandwich with a mushroom filling." },
      { name: "Chilli Cheese Sandwich", price: 174, isVeg: true, shortDescription: "Grilled sandwich with chilli and melted cheese." },
    ],
  },
  {
    name: "Pizza",
    slug: "pizza",
    description: "Hot, cheesy and loaded.",
    image: "/images/menu/pizza.webp",
    products: [
      { name: "Margaretta Pizza", price: 191, isVeg: true, shortDescription: "The classic cheese and tomato pizza." },
      { name: "Paneer Pizza", price: 225, isVeg: true, shortDescription: "Pizza topped with paneer." },
      { name: "Veggie Loaded Pizza", price: 244, isVeg: true, shortDescription: "Pizza loaded with vegetables." },
      { name: "Golden Corn Pizza", price: 225, isVeg: true, shortDescription: "Pizza topped with golden sweet corn." },
      { name: "Chicken Loaded Pizza", price: 290, isVeg: false, shortDescription: "Pizza loaded with chicken." },
      { name: "Mushroom Pizza", price: 244, isVeg: true, shortDescription: "Pizza topped with mushrooms." },
    ],
  },
  {
    name: "Burgers",
    slug: "burgers",
    description: "Crispy tikkis in soft buns.",
    image: "/images/menu/burgers.webp",
    products: [
      { name: "Veg Tikki Burger", price: 121, isVeg: true, shortDescription: "Burger with a crispy veg tikki." },
      { name: "Paneer Tikki Burger", price: 155, isVeg: true, shortDescription: "Burger with a paneer tikki." },
      { name: "Chicken Tikki Burger", price: 173, isVeg: false, shortDescription: "Burger with a chicken tikki." },
    ],
  },
  {
    name: "Maggi",
    slug: "maggi",
    description: "Everyone's favourite comfort noodles.",
    image: "/images/menu/maggi.webp",
    products: [
      { name: "Spicy Masala Maggi", price: 86, isVeg: true, shortDescription: "Maggi with an extra spicy masala." },
      { name: "Sweet Corn Maggi", price: 103, isVeg: true, shortDescription: "Maggi tossed with sweet corn." },
      { name: "Cheese Maggi", price: 121, isVeg: true, shortDescription: "Maggi finished with cheese." },
    ],
  },
  {
    name: "Pasta",
    slug: "pasta",
    description: "Saucy, comforting pasta bowls.",
    image: "/images/menu/pasta.webp",
    products: [
      { name: "Red Sauce Pasta", price: 173, isVeg: true, shortDescription: "Pasta in a tangy red sauce." },
      { name: "White Sauce Pasta", price: 205, isVeg: true, shortDescription: "Pasta in a creamy white sauce." },
    ],
  },
  {
    name: "Momos",
    slug: "momos",
    description: "Steamed or fried, served with spicy chutney.",
    image: "/images/menu/momos.webp",
    products: [
      { name: "Chicken Steam Momo", price: 155, isVeg: false, servingInfo: "6 pcs", shortDescription: "Steamed chicken momos." },
      { name: "Fried Momo", price: 173, isVeg: false, servingInfo: "6 pcs", shortDescription: "Crispy fried momos." },
    ],
  },
  {
    name: "Dry Bites",
    slug: "dry-bites",
    description: "Crispy, juicy starters for every craving.",
    image: "/images/menu/dry-bites.webp",
    products: [
      { name: "Chicken Meat Ball", price: 194, isVeg: false, servingInfo: "8 pcs", shortDescription: "Chicken meat balls." },
      { name: "Chicken Nuggets", price: 186, isVeg: false, servingInfo: "6 pcs", shortDescription: "Crispy chicken nuggets." },
      { name: "Chicken Seekh Kabab", price: 295, isVeg: false, servingInfo: "6 pcs", shortDescription: "Chicken seekh kababs." },
      { name: "Chicken 65", price: 211, isVeg: false, servingInfo: "8 pcs", shortDescription: "Spicy fried Chicken 65." },
      { name: "Chicken Strips", price: 281, isVeg: false, servingInfo: "6 pcs", shortDescription: "Crispy chicken strips." },
      { name: "Chicken Drumstick", price: 138, isVeg: false, servingInfo: "1 pc", shortDescription: "Fried chicken drumstick." },
      { name: "Pure Bhetki Fish Fry", price: 155, isVeg: false, servingInfo: "1 pc", shortDescription: "Kolkata-style bhetki fish fry." },
    ],
  },
  {
    name: "Mexican Chicken Wrap",
    slug: "mexican-chicken-wrap",
    description: "A loaded wrap with Mexican flavours.",
    image: "/images/menu/mexican-chicken-wrap.webp",
    products: [{ name: "Mexican Chicken Wrap", price: 174, isVeg: false, shortDescription: "Chicken wrap with Mexican-style flavours." }],
  },
  {
    name: "Fries",
    slug: "fries",
    description: "Golden and crispy.",
    image: "/images/menu/fries.webp",
    products: [{ name: "French Fries", price: 173, isVeg: true, shortDescription: "Golden, crispy french fries.", addOnGroup: "periPeri" }],
  },
  {
    name: "Bite Affairs Special Combos",
    slug: "special-combos",
    description: "Our signature Chinese combos.",
    image: "/images/menu/combo-fried-rice.webp",
    products: [
      {
        name: "Chicken Fried Rice Combo",
        price: 239,
        isVeg: false,
        isFeatured: true,
        image: "/images/menu/combo-fried-rice.webp",
        shortDescription: "Chicken Fried Rice + Chilli Chicken (2 pcs) + Chicken 65.",
      },
      {
        name: "Chicken Noodles Combo",
        price: 239,
        isVeg: false,
        isFeatured: true,
        image: "/images/menu/combo-noodles.webp",
        shortDescription: "Chicken Noodles + Chilli Chicken (2 pcs) + Chicken 65.",
      },
    ],
  },
];
