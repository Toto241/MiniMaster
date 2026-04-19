/**
 * Tests for detectExifGpsTag — pure-JS EXIF GPS marker detection.
 */
import { detectExifGpsTag } from "../src/tasks";

const EXIF_MARKER = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"

function buildJpegWithGps(bigEndian: boolean): Buffer {
  // SOI + APP1 marker + segment length filler + EXIF marker + TIFF header + GPS tag
  const tiffHeader = bigEndian
    ? Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08])
    : Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const gpsTag = bigEndian
    ? Buffer.from([0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x20])
    : Buffer.from([0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00]);
  // Some padding before EXIF marker (simulates SOI/APP1 length bytes)
  const prefix = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x10, 0x00]);
  return Buffer.concat([prefix, EXIF_MARKER, tiffHeader, gpsTag, Buffer.alloc(2048, 0xFF)]);
}

function buildJpegWithoutGps(bigEndian: boolean): Buffer {
  const tiffHeader = bigEndian
    ? Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08])
    : Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const someOtherTag = bigEndian
    ? Buffer.from([0x01, 0x0F, 0x00, 0x02]) // Make tag (0x010F)
    : Buffer.from([0x0F, 0x01, 0x02, 0x00]);
  const prefix = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x10, 0x00]);
  return Buffer.concat([prefix, EXIF_MARKER, tiffHeader, someOtherTag, Buffer.alloc(2048, 0xAA)]);
}

describe("detectExifGpsTag", () => {
  it("returns false for empty / too-small buffers", () => {
    expect(detectExifGpsTag(Buffer.alloc(0))).toBe(false);
    expect(detectExifGpsTag(Buffer.alloc(16))).toBe(false);
    expect(detectExifGpsTag(null as unknown as Buffer)).toBe(false);
  });

  it("returns false when no EXIF marker is present", () => {
    const buf = Buffer.alloc(2048, 0xFF);
    expect(detectExifGpsTag(buf)).toBe(false);
  });

  it("returns false when EXIF marker is present but TIFF endianness header is invalid", () => {
    const prefix = Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x10, 0x00]);
    const badTiff = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const buf = Buffer.concat([prefix, EXIF_MARKER, badTiff, Buffer.alloc(64, 0)]);
    expect(detectExifGpsTag(buf)).toBe(false);
  });

  it("detects GPS tag in big-endian (MM) TIFF header", () => {
    expect(detectExifGpsTag(buildJpegWithGps(true))).toBe(true);
  });

  it("detects GPS tag in little-endian (II) TIFF header", () => {
    expect(detectExifGpsTag(buildJpegWithGps(false))).toBe(true);
  });

  it("returns false for JPEG with EXIF but no GPS tag (big-endian)", () => {
    expect(detectExifGpsTag(buildJpegWithoutGps(true))).toBe(false);
  });

  it("returns false for JPEG with EXIF but no GPS tag (little-endian)", () => {
    expect(detectExifGpsTag(buildJpegWithoutGps(false))).toBe(false);
  });

  it("does not match GPS bytes appearing before the EXIF marker (false-positive guard)", () => {
    const fakeGpsBefore = Buffer.from([0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01]);
    const tiffHeader = Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08]);
    const buf = Buffer.concat([fakeGpsBefore, EXIF_MARKER, tiffHeader, Buffer.alloc(64, 0xAA)]);
    // GPS bytes are before the EXIF marker → not in scanned segment → false
    expect(detectExifGpsTag(buf)).toBe(false);
  });
});
