// 外部依存なしで拡張アイコン(PNG)を生成する。npm run icons
// デザイン: 青い角丸の下地に、開いた本（右開き）と縦書きの行を白で描く。
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const BG = [26, 95, 180];
const FG = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = (crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 単位座標 (0..1) で描き、4x4 スーパーサンプリングで縁を滑らかにする
function sample(u, v) {
  // 角丸の下地
  const r = 0.2;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return null;

  // 本の2つのページ（中央に綴じ目の隙間）
  const inPage = (x0, x1) => u >= x0 && u <= x1 && v >= 0.24 && v <= 0.78;
  const left = inPage(0.13, 0.485);
  const right = inPage(0.515, 0.87);
  if (!left && !right) return BG;

  // 縦書きの行（細い縦線）
  const lines = (x0, x1) => {
    const n = 4;
    const w = (x1 - x0) / (n * 2 + 1);
    const k = Math.floor((u - x0) / w);
    return k % 2 === 1 && v >= 0.32 && v <= 0.7;
  };
  if ((left && lines(0.13, 0.485)) || (right && lines(0.515, 0.87))) return BG;
  return FG;
}

await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of SIZES) {
  const SS = 4;
  const data = png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < SS; i++)
      for (let j = 0; j < SS; j++) {
        const c = sample((x - 0.5 + (i + 0.5) / SS) / size, (y - 0.5 + (j + 0.5) / SS) / size);
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
    return a === 0 ? [0, 0, 0, 0] : [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (SS * SS)) * 255)];
  });
  await writeFile(new URL(`../public/icons/icon${size}.png`, import.meta.url), data);
  console.log('icon', size);
}
