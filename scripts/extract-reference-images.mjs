// Crops the food photography out of the provided menu poster (public/reference/bite-affairs-menu.jpg)
// into individual WebP files used as initial category imagery until real photos are uploaded.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "public/reference/bite-affairs-menu.jpg";
const OUT = "public/images/menu";
export const CROPS = {
  sandwiches: [335, 300, 172, 232],
  pizza: [808, 305, 198, 225],
  burgers: [330, 560, 172, 155],
  maggi: [822, 560, 182, 155],
  pasta: [300, 742, 205, 133],
  momos: [815, 742, 190, 133],
  "dry-bites": [318, 905, 192, 250],
  "mexican-chicken-wrap": [836, 905, 168, 110],
  fries: [815, 1040, 190, 115],
  "combo-fried-rice": [28, 1212, 285, 145],
  "combo-noodles": [533, 1212, 278, 145],
};

await mkdir(OUT, { recursive: true });
for (const [name, [left, top, width, height]] of Object.entries(CROPS)) {
  await sharp(SOURCE).extract({ left, top, width, height }).resize({ width: width * 3, kernel: "lanczos3" }).sharpen().webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);
}
// Contact sheet for visual verification
const tiles = await Promise.all(Object.keys(CROPS).map((n) => sharp(`${OUT}/${n}.webp`).resize(240, 160, { fit: "cover" }).toBuffer()));
await sharp({ create: { width: 240 * 4, height: 160 * 3, channels: 3, background: "#000" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 240, top: Math.floor(i / 4) * 160 })))
  .jpeg()
  .toFile(process.argv[2] ?? "/tmp/contact.jpg");
console.log("Extracted", Object.keys(CROPS).length, "images to", OUT);
