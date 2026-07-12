// controllers/testController.js

import Test from "../models/Test.js";
import TestSeries from "../models/TestSeries.js";

// Ensures a Test's category matches its TestSeries' category, if a testSeries is given.
// Returns an error message string if invalid, or null if OK.
const validateCategorySeriesMatch = async (categoryId, testSeriesId) => {
  if (!testSeriesId) return null; // standalone test, nothing to cross-check

  const series = await TestSeries.findById(testSeriesId);
  if (!series) return "testSeries not found";

  if (String(series.category) !== String(categoryId)) {
    return `category mismatch: TestSeries "${series.name}" belongs to a different category`;
  }
  return null;
};

// ✅ GET tests (by category or series)
// Students/instructors only see published + active tests.
// Admin sees everything (including drafts) for management purposes.
export const getTests = async (req, res) => {
  try {
    const filter = {};

    if (req.user?.role === "admin") {
      // admin can optionally filter by isActive/isPublished too
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

    if (req.query.testSeries) {
      filter.testSeries = req.query.testSeries;
    }

    const tests = await Test.find(filter)
      .select("title description duration totalQuestions totalMarks isPublished isPaid category testSeries")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: tests.length,
      data: tests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching tests",
      error: error.message,
    });
  }
};

// ✅ GET single test
export const getTestById = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id).lean();

    if (!test || !test.isActive) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    if (req.user?.role !== "admin" && !test.isPublished) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    res.status(200).json({
      success: true,
      data: test,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching test",
      error: error.message,
    });
  }
};

// ✅ CREATE test
export const createTest = async (req, res) => {
  try {

    const { category, testSeries } = req.body;

    const validationError = await validateCategorySeriesMatch(category, testSeries);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
    const test = await Test.create({ ...req.body, createdBy: req.user.id });

    // 🔥 update totalTests in series (if this test belongs to one)
    if (test.testSeries) {
      await TestSeries.findByIdAndUpdate(test.testSeries, {
        $inc: { totalTests: 1 },
      });
    }

    res.status(201).json({
      success: true,
      message: "Test created",
      data: test,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating test",
      error: error.message,
    });
  }
};

// ✅ UPDATE
export const updateTest = async (req, res) => {
  try {
    const existing = await Test.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    const category = req.body.category ?? existing.category;
    const testSeries = req.body.testSeries !== undefined ? req.body.testSeries : existing.testSeries;

    const validationError = await validateCategorySeriesMatch(category, testSeries);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const updated = await Test.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    // testSeries changed -> keep totalTests counters in sync
    const oldSeries = existing.testSeries ? String(existing.testSeries) : null;
    const newSeries = updated.testSeries ? String(updated.testSeries) : null;

    if (oldSeries !== newSeries) {
      if (oldSeries) await TestSeries.findByIdAndUpdate(oldSeries, { $inc: { totalTests: -1 } });
      if (newSeries) await TestSeries.findByIdAndUpdate(newSeries, { $inc: { totalTests: 1 } });
    }

    res.status(200).json({
      success: true,
      message: "Test updated",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating test",
      error: error.message,
    });
  }
};

// ✅ DELETE (soft)
export const deleteTest = async (req, res) => {
  try {
    const deleted = await Test.findByIdAndUpdate(
      req.params.id,
      { isActive: false, isPublished: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    if (deleted.testSeries) {
      await TestSeries.findByIdAndUpdate(deleted.testSeries, {
        $inc: { totalTests: -1 },
      });
    }

    res.status(200).json({
      success: true,
      message: "Test deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting test",
      error: error.message,
    });
  }
};
