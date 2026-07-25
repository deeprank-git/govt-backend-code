// controllers/testSeriesController.js

import fs from "fs";
import path from "path";
import TestSeries from "../models/TestSeries.js";
import { UPLOAD_DIR } from "../middleware/upload.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Every importantDates value must be an exact { from, to } date range (a
// single day is just from === to) — free-text entries like "July 2025" or
// "24/10/2025" are rejected so the data stays sortable/comparable.
const validateImportantDates = (importantDates) => {
  for (const [label, value] of Object.entries(importantDates)) {
    const valid =
      value &&
      typeof value === "object" &&
      DATE_RE.test(value.from) &&
      DATE_RE.test(value.to) &&
      new Date(value.from) <= new Date(value.to);
    if (!valid) {
      throw new Error(`"${label}" must be { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } with from <= to`);
    }
  }
};

const FILE_FIELDS = ["image", "notificationPdf", "infoPdf"];

// ✅ GET all (filter by category optional)
// Students/instructors only see published + active series. Admin sees all.
export const getTestSeries = async (req, res) => {
  try {
    const filter = {};

    if (req.user?.role === "admin") {
      if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
      if (req.query.isPublished !== undefined)
        filter.isPublished = req.query.isPublished === "true";
    } else {
      filter.isActive = true;
      filter.isPublished = true;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const series = await TestSeries.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: series.length,
      data: series,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching test series",
      error: error.message,
    });
  }
};

// ✅ GET single
export const getTestSeriesById = async (req, res) => {
  try {
    const series = await TestSeries.findById(req.params.id).lean();

    if (!series || !series.isActive) {
      return res.status(404).json({
        success: false,
        message: "Test Series not found",
      });
    }

    if (req.user?.role !== "admin" && !series.isPublished) {
      return res.status(404).json({
        success: false,
        message: "Test Series not found",
      });
    }

    res.status(200).json({
      success: true,
      data: series,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching test series",
      error: error.message,
    });
  }
};

// ✅ CREATE
export const createTestSeries = async (req, res) => {
  try {
    const { importantDates, ...rest } = req.body;
    const payload = { ...rest, createdBy: req.user.id };

    if (importantDates !== undefined) {
      try {
        payload.importantDates = JSON.parse(importantDates);
        validateImportantDates(payload.importantDates);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: `Invalid importantDates: ${parseError.message}`,
        });
      }
    }

    for (const field of FILE_FIELDS) {
      const uploaded = req.files?.image?.[0]s?.[field]?.[0];
      if (uploaded) payload[field] = `/uploads/${uploadeds.image[0].filename}`;
    if (req.files?.notificationPdf?.[0])
      payload.notificationPdf = `/uploads/${req.files.notificationPdf[0].filename}`;
    }

    const series = await TestSeries.create(payload);

    res.status(201).json({
      success: true,
      message: "Test Series created",
      data: series,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating test series",
      error: error.message,
    });
  }
};

// ✅ UPDATE
export const updateTestSeries = async (req, res) => {
  try {
    const { importantDates, ...rest } = req.body;
    const payload = { ...rest };

    if (importantDates !== undefined) payload.importantDates = JSON.parse(importantDates);

    if (req.files?.image?.[0] || req.files?.notificationPdf?.[0]) {
      const existing = await TestSeries.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Test Series not found",
        });
      }
      if (req.files.image?.[0]) {
        payload.image = `/uploads/${req.files.image[0].filename}`;
        if (existing.image) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(existing.image)), () => {});
        }
      }
      if (req.files.notificationPdf?.[0]) {
        payload.notificationPdf = `/uploads/${req.files.notificationPdf[0].filename}`;
        if (existing.notificationPdf) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(existing.notificationPdf)), () => {});
        }
      }
    }

    const updated = await TestSeries.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Test Series not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Test Series updated",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating test series",
      error: error.message,
    });
  }
};

// ✅ DELETE (soft)
export const deleteTestSeries = async (req, res) => {
  try {
    const deleted = await TestSeries.findByIdAndUpdate(
      req.params.id,
      { isActive: false, isPublished: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Test Series not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Test Series deleted (soft)",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting test series",
      error: error.message,
    });
  }
};
