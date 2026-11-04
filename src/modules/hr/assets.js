import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { Asset } from "./models.js";
import {
  id,
  text,
  longText,
  date,
  fail,
  permit,
  audit,
  list,
  transaction,
} from "../../shared/workflow.js";
export const AssetMaintenance = mongoose.model(
  "AssetMaintenance",
  new mongoose.Schema(
    {
      asset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset" },
      description: String,
      startDate: String,
      endDate: String,
      status: { type: String, enum: ["Open", "Completed"], default: "Open" },
      resolution: String,
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true, strict: "throw", optimisticConcurrency: true },
  ),
);
AssetMaintenance.schema.index(
  { asset: 1 },
  { unique: true, partialFilterExpression: { status: "Open" } },
);
export function assetMaintenanceRoutes() {
  const router = Router();
  router.patch("/assets/:id", permit("assets.manage"), async (req, res) => {
    const input = z
      .object({
        name: text,
        category: text,
        brand: z.string().max(100).default(""),
        model: z.string().max(100).default(""),
        warrantyExpiry: date,
      })
      .parse(req.body);
    const asset = await Asset.findById(req.params.id);
    if (!asset) fail(404, "Asset not found");
    if (asset.status === "Retired")
      fail(409, "Retired assets preserve their final record");
    Object.assign(asset, input);
    await asset.save();
    await audit(req, "asset.updated", asset.id);
    res.json({ data: asset });
  });
  router.get("/asset-maintenance", permit("assets.manage"), async (req, res) =>
    res.json(
      await list(AssetMaintenance, {}, req, {
        populate: { path: "asset", select: "name serial" },
      }),
    ),
  );
  router.post(
    "/asset-maintenance",
    permit("assets.manage"),
    async (req, res) => {
      const input = z
        .object({ asset: id, description: longText, startDate: date })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const asset = await Asset.findOne({
          _id: input.asset,
          status: { $in: ["Available", "Under Repair"] },
        }).session(session);
        if (!asset) fail(409, "Return the asset before opening maintenance");
        if (
          await AssetMaintenance.exists({
            asset: asset._id,
            status: "Open",
          }).session(session)
        )
          fail(409, "Maintenance is already open");
        asset.status = "Under Repair";
        await asset.save({ session });
        const [record] = await AssetMaintenance.create(
          [{ ...input, createdBy: req.user._id }],
          { session },
        );
        await audit(req, "asset.maintenance.opened", record.id, session);
        return record;
      });
      res.status(201).json({ data: record });
    },
  );
  router.post(
    "/asset-maintenance/:id/complete",
    permit("assets.manage"),
    async (req, res) => {
      const input = z
        .object({
          endDate: date,
          resolution: longText,
          condition: z.enum(["New", "Good", "Fair", "Damaged"]),
          retire: z.boolean().default(false),
        })
        .parse(req.body);
      const record = await transaction(async (session) => {
        const record = await AssetMaintenance.findOne({
          _id: req.params.id,
          status: "Open",
        }).session(session);
        if (!record) fail(409, "Open maintenance record required");
        if (input.endDate < record.startDate)
          fail(422, "Completion must follow the maintenance start");
        record.status = "Completed";
        record.endDate = input.endDate;
        record.resolution = input.resolution;
        await record.save({ session });
        await Asset.updateOne(
          { _id: record.asset, status: "Under Repair" },
          {
            $set: {
              condition: input.condition,
              status: input.retire
                ? "Retired"
                : input.condition === "Damaged"
                  ? "Under Repair"
                  : "Available",
            },
          },
          { session },
        );
        await audit(req, "asset.maintenance.completed", record.id, session);
        return record;
      });
      res.json({ data: record });
    },
  );
  return router;
}
