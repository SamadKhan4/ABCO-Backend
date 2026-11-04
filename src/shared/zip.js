import { crc32 } from "node:zlib";
// Bounded ZIP32 archive, stored entries. Names are supplied by the server.
export function zipFiles(files) {
  if (files.length > 1000) throw new Error("Archive is limited to 1000 files");
  const local = [],
    directory = [];
  let offset = 0;
  for (const file of files) {
    if (!/^[a-z\d_.-]+$/i.test(file.name) || file.name.includes(".."))
      throw new Error("Unsafe archive filename");
    const name = Buffer.from(file.name),
      data = Buffer.from(file.data),
      checksum = crc32(data),
      header = Buffer.alloc(30),
      central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    local.push(header, name, data);
    directory.push(central, name);
    offset += header.length + name.length + data.length;
    if (offset > 64 * 1024 * 1024) throw new Error("Archive exceeds 64 MB");
  }
  const index = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}
