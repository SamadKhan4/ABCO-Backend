import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  writeFile,
  stat,
  rm,
} from "node:fs/promises";
import { resolve, relative, join, isAbsolute } from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

dotenv.config({ path: ".env", quiet: true });
const magic = Buffer.from("ABCOBKP1"),
  root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const EJSON = mongoose.mongo.BSON.EJSON;
function config() {
  if (!/^[a-f\d]{64}$/i.test(process.env.BACKUP_KEY || ""))
    throw new Error(
      "Set BACKUP_KEY to a separate 32-byte hex encryption key and store it securely off-server.",
    );
  return Buffer.from(process.env.BACKUP_KEY, "hex");
}
function inside(parent, child) {
  const p = relative(parent, child);
  return p !== "" && !p.startsWith("..") && !isAbsolute(p);
}
async function* files(directory, base = directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isSymbolicLink())
      throw new Error("Storage symlinks are not supported");
    if (item.isDirectory()) yield* files(path, base);
    else if (item.isFile())
      yield { path, name: relative(base, path).replaceAll("\\", "/") };
  }
}
export async function backup({ uri, storage, output, key }) {
  if (process.env.HRMS_MAINTENANCE_ACK !== "YES")
    throw new Error(
      "Stop API and workers, then set HRMS_MAINTENANCE_ACK=YES for a consistent database and document backup.",
    );
  const source = await mongoose.createConnection(uri).asPromise();
  const session = await source.startSession();
  try {
    const collections = (
      await source.db.listCollections({ type: "collection" }).toArray()
    )
      .map((c) => c.name)
      .filter((n) => n !== "sessions" && !n.startsWith("system."))
      .sort();
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const header = Buffer.concat([magic, iv, Buffer.alloc(16)]);
    const handle = await open(output, "wx", 0o600);
    await handle.write(header);
    await handle.close();
    session.startTransaction({ readConcern: { level: "snapshot" } });
    async function* records() {
      yield JSON.stringify({
        kind: "manifest",
        version: 1,
        createdAt: new Date().toISOString(),
        collections,
      }) + "\n";
      for (const collection of collections) {
        for await (const document of source.db
          .collection(collection)
          .find({}, { session }))
          yield JSON.stringify({
            kind: "document",
            collection,
            value: EJSON.serialize(document, { relaxed: false }),
          }) + "\n";
      }
      await session.commitTransaction();
      try {
        for await (const file of files(storage)) {
          const info = await stat(file.path);
          if (info.size > 16 * 1024 * 1024)
            throw new Error("Storage file exceeds the supported backup limit");
          yield JSON.stringify({
            kind: "file",
            name: file.name,
            value: (await readFile(file.path)).toString("base64"),
          }) + "\n";
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      yield JSON.stringify({ kind: "complete" }) + "\n";
    }
    try {
      await pipeline(
        Readable.from(records()),
        createGzip(),
        cipher,
        createWriteStream(output, { flags: "r+", start: header.length }),
      );
      const file = await open(output, "r+");
      try {
        await file.write(cipher.getAuthTag(), 0, 16, 20);
      } finally {
        await file.close();
      }
    } catch (error) {
      await rm(output, { force: true });
      throw error;
    }
  } finally {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
    await source.close();
  }
}
async function decryptor(file, key) {
  const handle = await open(file, "r");
  const header = Buffer.alloc(36);
  try {
    const { bytesRead } = await handle.read(header, 0, 36, 0);
    if (bytesRead !== 36 || !header.subarray(0, 8).equals(magic))
      throw new Error("Invalid backup format");
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(8, 20));
  decipher.setAuthTag(header.subarray(20, 36));
  return decipher;
}
export async function verifyBackup({ uri, input, key, verificationRoot }) {
  // Authenticate the entire archive before opening a target database.
  await pipeline(
    createReadStream(input, { start: 36 }),
    await decryptor(input, key),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
  const name = `abco_restore_test_${randomUUID().replaceAll("-", "")}`,
    storage = resolve(verificationRoot, name);
  if (
    !inside(resolve(verificationRoot), storage) ||
    !/^abco_restore_test_[a-f\d]{32}$/.test(name)
  )
    throw new Error("Unsafe verification target");
  const connection = await mongoose
    .createConnection(uri, { dbName: name })
    .asPromise();
  let documents = 0,
    fileCount = 0,
    complete = false,
    manifest;
  try {
    await mkdir(storage, { recursive: true, mode: 0o700 });
    const output = new (await import("node:stream")).PassThrough();
    const processing = pipeline(
      createReadStream(input, { start: 36 }),
      await decryptor(input, key),
      createGunzip(),
      output,
    );
    // Attach rejection handling immediately while consuming the line stream.
    processing.catch((error) => output.destroy(error));
    try {
      for await (const line of createInterface({
        input: output,
        crlfDelay: Infinity,
      })) {
        const record = JSON.parse(line);
        if (record.kind === "manifest") {
          if (
            manifest ||
            record.version !== 1 ||
            !Array.isArray(record.collections)
          )
            throw new Error("Invalid backup manifest");
          manifest = record;
        } else if (record.kind === "document") {
          if (
            !manifest?.collections.includes(record.collection) ||
            record.collection === "sessions" ||
            record.collection.startsWith("system.")
          )
            throw new Error("Unexpected collection");
          await connection.db
            .collection(record.collection)
            .insertOne(EJSON.deserialize(record.value));
          documents++;
        } else if (record.kind === "file") {
          const path = resolve(storage, record.name);
          if (!inside(storage, path) || isAbsolute(record.name))
            throw new Error("Unsafe storage path");
          await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
          await writeFile(path, Buffer.from(record.value, "base64"), {
            flag: "wx",
            mode: 0o600,
          });
          fileCount++;
        } else if (record.kind === "complete") complete = true;
        else throw new Error("Unexpected archive record");
      }
    } finally {
      await processing;
    }
    if (!manifest || !complete) throw new Error("Incomplete backup");
    return {
      verified: true,
      documents,
      files: fileCount,
      collections: manifest.collections.length,
    };
  } finally {
    if (
      connection.name === name &&
      /^abco_restore_test_[a-f\d]{32}$/.test(name)
    )
      await connection.dropDatabase();
    else {
      console.error(
        "Verification database safety check failed; cleanup refused.",
      );
      process.exitCode = 1;
    }
    await connection.close();
    if (inside(resolve(verificationRoot), storage))
      await rm(storage, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, path] = process.argv.slice(2);
    if (!["create", "verify"].includes(command) || !path)
      throw new Error(
        "Usage: node scripts/backup.mjs create|verify <archive.abco>",
      );
    const key = config(),
      uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    if (command === "create") {
      await backup({
        uri,
        key,
        output: resolve(path),
        storage: process.env.DOCUMENT_STORAGE_PATH
          ? resolve(root, process.env.DOCUMENT_STORAGE_PATH)
          : join(root, "storage/documents"),
      });
      console.log(
        "Encrypted database and document backup created. Verify it before retention or transfer.",
      );
    } else
      console.log(
        JSON.stringify(
          await verifyBackup({
            uri,
            key,
            input: resolve(path),
            verificationRoot: join(
              root,
              "storage/restore-verification",
            ),
          }),
        ),
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
