import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { backup, verifyBackup } from "../scripts/backup.mjs";
test("encrypted backup restores BSON and private files into an isolated verification target", async () => {
  const name = `abco_test_${randomUUID().replaceAll("-", "")}`,
    directory = await mkdtemp(join(tmpdir(), "abco-backup-test-")),
    storage = join(directory, "documents"),
    output = join(directory, "archive.abco"),
    key = randomBytes(32),
    uri = `mongodb://127.0.0.1:27017/${name}`;
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    await mkdir(storage);
    await writeFile(join(storage, "private.bin"), randomBytes(64));
    await connection.db.collection("employees").insertOne({
      _id: new mongoose.Types.ObjectId(),
      name: "Private test employee",
      joined: new Date(),
      salary: mongoose.mongo.Long.fromString("12345678901"),
    });
    await connection.db
      .collection("sessions")
      .insertOne({ _id: "must-not-restore", session: "private" });
    process.env.HRMS_MAINTENANCE_ACK = "YES";
    await backup({ uri, storage, output, key });
    const bytes = await readFile(output);
    assert.equal(bytes.includes(Buffer.from("Private test employee")), false);
    const result = await verifyBackup({
      uri,
      input: output,
      key,
      verificationRoot: join(directory, "verify"),
    });
    assert.deepEqual(result, {
      verified: true,
      documents: 1,
      files: 1,
      collections: 1,
    });
    const corrupted = join(directory, "corrupted.abco");
    bytes[bytes.length - 1] ^= 1;
    await writeFile(corrupted, bytes);
    await assert.rejects(
      verifyBackup({
        uri,
        input: corrupted,
        key,
        verificationRoot: join(directory, "verify"),
      }),
    );
    await assert.rejects(
      verifyBackup({
        uri,
        input: output,
        key: randomBytes(32),
        verificationRoot: join(directory, "verify"),
      }),
    );
  } finally {
    assert.equal(connection.name, name);
    assert.match(name, /^abco_test_[a-f\d]{32}$/);
    await connection.dropDatabase();
    await connection.close();
    const safe = relative(resolve(tmpdir()), resolve(directory));
    assert.ok(safe && !safe.startsWith("..") && !isAbsolute(safe));
    await rm(directory, { recursive: true, force: true });
    delete process.env.HRMS_MAINTENANCE_ACK;
  }
});
