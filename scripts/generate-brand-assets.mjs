import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const emblemSrc =
  "/Users/javierjaramillo/.cursor/projects/Users-javierjaramillo-projects-abwellness/assets/favicon-emblem.png";
const ogSrc =
  "/Users/javierjaramillo/.cursor/projects/Users-javierjaramillo-projects-abwellness/assets/og-twitter-card.png";
const navy = { r: 0, g: 20, b: 40, alpha: 1 };

const emblem = sharp(emblemSrc).resize(1024, 1024, {
  fit: "cover",
  position: "centre",
});

async function writePngIcon(size, dest) {
  await emblem
    .clone()
    .resize(size, size, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .png({ compressionLevel: 9, force: true })
    .toFile(dest);
}

function createIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = [];
  const payloads = [];

  for (let i = 0; i < count; i += 1) {
    const png = pngBuffers[i];
    const size = sizes[i];
    entries.push({ size, bytes: png.length, offset });
    payloads.push(png);
    offset += png.length;
  }

  const ico = Buffer.alloc(offset);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(count, 4);

  entries.forEach((entry, index) => {
    const start = 6 + index * 16;
    ico.writeUInt8(entry.size === 256 ? 0 : entry.size, start);
    ico.writeUInt8(entry.size === 256 ? 0 : entry.size, start + 1);
    ico.writeUInt8(0, start + 2);
    ico.writeUInt8(0, start + 3);
    ico.writeUInt16LE(1, start + 4);
    ico.writeUInt16LE(32, start + 6);
    ico.writeUInt32LE(entry.bytes, start + 8);
    ico.writeUInt32LE(entry.offset, start + 12);
  });

  let cursor = headerSize;
  for (const png of payloads) {
    png.copy(ico, cursor);
    cursor += png.length;
  }

  return ico;
}

await writePngIcon(192, path.join(root, "app/icon.png"));
await writePngIcon(180, path.join(root, "app/apple-icon.png"));
await writePngIcon(512, path.join(root, "public/images/icon.png"));

const og = await sharp(ogSrc)
  .resize(1200, 630, { fit: "cover", position: "centre", background: navy })
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(path.join(root, "app/opengraph-image.png"), og);
await writeFile(path.join(root, "app/twitter-image.png"), og);
await writeFile(path.join(root, "public/images/og.png"), og);

const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(
  icoSizes.map((size) =>
    emblem
      .clone()
      .resize(size, size, { fit: "cover", position: "centre" })
      .ensureAlpha()
      .png({ force: true })
      .toBuffer(),
  ),
);

await writeFile(path.join(root, "app/favicon.ico"), createIco(icoPngs, icoSizes));

for (const file of [
  "app/icon.png",
  "app/apple-icon.png",
  "app/opengraph-image.png",
  "app/twitter-image.png",
  "public/images/icon.png",
  "public/images/og.png",
]) {
  const meta = await sharp(path.join(root, file)).metadata();
  console.log(file, meta.width, meta.height, meta.format);
}
