import { expect, test } from 'vitest'
import { imageInfo } from './image-info'

const png = (w: number, h: number) => {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}
const jpeg = (w: number, h: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03])

test('PNG size from the IHDR chunk', () => expect(imageInfo(png(800, 200))).toEqual({ type: 'png', width: 800, height: 200 }))
test('JPEG size from the SOF marker', () => expect(imageInfo(jpeg(640, 480))).toEqual({ type: 'jpg', width: 640, height: 480 }))
test('anything else is rejected', () => {
  expect(imageInfo(Buffer.from('GIF89a'))).toBeNull()
  expect(imageInfo(Buffer.alloc(0))).toBeNull()
  expect(imageInfo(Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBeNull()
})
