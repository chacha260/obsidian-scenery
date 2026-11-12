// A minimal ZIP writer (stored, no compression): enough to hand someone a folder as one file.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function zip(files: Map<string, Blob>): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: ArrayBuffer[] = [];
  let offset = 0;

  for (const [path, blob] of files) {
    const name = encoder.encode(path);
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    const crc = crc32(data);

    // Fields shared by the local header and the central directory entry.
    const common = new DataView(new ArrayBuffer(26));
    common.setUint16(0, 20, true); // version needed
    common.setUint16(2, 0x0800, true); // flags: UTF-8 names
    common.setUint16(4, 0, true); // method: stored
    common.setUint16(6, 0, true); // time
    common.setUint16(8, 0x21, true); // date: 1980-01-01
    common.setUint32(10, crc, true);
    common.setUint32(14, data.length, true);
    common.setUint32(18, data.length, true);
    common.setUint16(22, name.length, true);
    common.setUint16(24, 0, true); // extra length

    const local = new Uint8Array(new ArrayBuffer(30 + name.length));
    new DataView(local.buffer).setUint32(0, 0x04034b50, true);
    local.set(new Uint8Array(common.buffer), 4);
    local.set(name, 30);

    const entry = new Uint8Array(new ArrayBuffer(46 + name.length));
    const view = new DataView(entry.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true); // version made by
    entry.set(new Uint8Array(common.buffer), 6);
    view.setUint32(42, offset, true); // offset of the local header
    entry.set(name, 46);

    parts.push(local.buffer, buffer);
    central.push(entry.buffer);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, e) => n + e.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length, true);
  end.setUint16(10, central.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
