export type ImageInfo = { type: 'png' | 'jpg'; width: number; height: number }

/**
 * Type and pixel size of a PNG or JPEG, read from the header only; null for anything else.
 * Used to accept only real PNG/JPEG logos (spec 4.2) and to size them in the documents.
 */
export function imageInfo(data: Uint8Array): ImageInfo | null {
  const b = toBuffer(data)
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  }
  const frame = jpegFrameOffset(b)
  return frame === null ? null : { type: 'jpg', height: b.readUInt16BE(frame + 5), width: b.readUInt16BE(frame + 7) }
}

/**
 * True for a JPEG with four color components (CMYK or YCCK). It is printed as DeviceCMYK, which a PDF/A file with
 * an RGB output intent (the ZUGFeRD invoice) must not contain.
 */
export function isCmykJpeg(data: Uint8Array): boolean {
  const b = toBuffer(data)
  const frame = jpegFrameOffset(b)
  return frame !== null && frame + 9 < b.length && b[frame + 9] === 4
}

const toBuffer = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength)

/** Offset of a JPEG's frame header (SOF marker), which carries size and color components; null if not a JPEG. */
function jpegFrameOffset(b: Buffer): number | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    // SOF0–SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return i
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}
