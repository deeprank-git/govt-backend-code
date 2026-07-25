// controllers/testController.js

import Test from "../models/Test.js";
import TestSeries from "../models/TestSeries.js";

// Test.duration has no other source of truth (unlike totalQuestions/totalMarks,
// which stay in sync with actual Question docs via recalcTestTotals in
// questionController.js), so it's fully derived from sections here.
const computeDuration = (sections) => sections.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

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
    const { sections, duration, ...rest } = req.body;
    const payload = { ...rest, createdBy: req.user.id };

    if (sections !== undefined) {
      payload.sections = sections;
      payload.duration = computeDuration(sections);
    }

    const test = await Test.create(payload);

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

    const { sections, duration, ...rest } = req.body;
    const payload = { ...rest };

    if (sections !== undefined) {
      payload.sections = sections;
      payload.duration = computeDuration(sections);
    }

    const updated = await Test.findByIdAndUpdate(req.params.id, payload, {
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
