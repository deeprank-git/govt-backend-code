// controllers/testSeriesController.js

import TestSeries from "../models/TestSeries.js";

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
    const series = await TestSeries.create({ ...req.body, createdBy: req.user.id });

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
    const updated = await TestSeries.findByIdAndUpdate(req.params.id, req.body, {
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
