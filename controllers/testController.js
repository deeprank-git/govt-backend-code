// controllers/testController.js

import Test from "../models/Test.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";

// Test.duration has no other source of truth (unlike totalQuestions/totalMarks,
// which stay in sync with actual Question docs via recalcTestTotals in
// questionController.js), so it's fully derived from sections here.
const computeDuration = (sections) => sections.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

// Returns an array of error strings describing every invalid question.
// Empty array means all questions are valid.
// `sectionNames` is the array of section name strings from the request body.
const validateQuestions = (questions, sectionNames) => {
  const errors = [];
  const nameSet = new Set(sectionNames);

  questions.forEach((q, i) => {
    const prefix = `questions[${i}]`;

    if (!q.section) {
      errors.push(`${prefix}: section (name string) is required`);
    } else if (!nameSet.has(q.section)) {
      errors.push(`${prefix}: section "${q.section}" not found in sections`);
    }

    if (!q.questionText) errors.push(`${prefix}: questionText is required`);

    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 4 || opts.length > 5) {
      errors.push(`${prefix}: options must have 4 or 5 items`);
    }

    const maxIdx = opts.length - 1;
    const ca = Number(q.correctAnswer);
    if (
      q.correctAnswer === undefined ||
      q.correctAnswer === null ||
      !Number.isInteger(ca) ||
      ca < 0 ||
      ca > maxIdx
    ) {
      errors.push(`${prefix}: correctAnswer must be an integer from 0 to ${maxIdx}`);
    }
  });

  return errors;
};

// ✅ GET tests (by category or series)
// Students/instructors only see published + active tests.
// Admin sees everything (including drafts) for management purposes.
export const getTests = async (req, res) => {
  try {
    const filter = {};

    if (req.user?.role === "admin") {
      // Admin defaults to active tests; pass ?isActive=false to see soft-deleted ones
      filter.isActive = req.query.isActive !== "false";
      if (req.query.isPublished !== undefined)
        filter.isPublished = req.query.isPublished === "true";
    } else {
      filter.isActive = true;
      filter.isPublished = true;
    }

    if (req.query.testSeries) {
      // more specific than category — takes precedence if both are given
      filter.testSeries = req.query.testSeries;
    } else if (req.query.category) {
      const seriesIds = await TestSeries.find({ category: req.query.category }).distinct("_id");
      filter.testSeries = { $in: seriesIds };
    }

    if (req.query.paperType) {
      filter.paperType = req.query.paperType;
    }

    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: "i" };
    }

    if (req.query.year) {
      const year = Number(req.query.year);
      if (!Number.isNaN(year)) {
        filter.examDate = {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lte: new Date(`${year}-12-31T23:59:59.999Z`),
        };
      }
    }

    const tests = await Test.find(filter)
      .select(
        "title description duration totalQuestions totalMarks isPublished isPaid testSeries paperType examDate attemptsCount"
      )
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
    const test = await Test.findById(req.params.id)
      .populate("testSeries", "name image")
      .lean();

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

// POST /api/admin/tests/with-questions
// Creates a Test and its Questions atomically.
// If question insert fails after the Test is saved, the Test is deleted and
// the TestSeries counter is reversed so nothing is left in a partial state.
export const createTestWithQuestions = async (req, res) => {
  try {
    const { questions = [], sections, ...testFields } = req.body;

    // 1. Upfront validation — no DB writes yet
    if (!sections || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one section is required",
      });
    }

    const sectionNames = sections.map((s) => s.name);
    const questionErrors = validateQuestions(questions, sectionNames);
    if (questionErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: questionErrors,
      });
    }

    // 2. Create the Test — sections get their Mongoose _id values here
    let test;
    try {
      test = await Test.create({
        ...testFields,
        sections,
        duration: computeDuration(sections),
        createdBy: req.user.id,
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Error creating test",
        error: err.message,
      });
    }

    // 3. Increment TestSeries counter (mirrors createTest behaviour)
    if (test.testSeries) {
      await TestSeries.findByIdAndUpdate(test.testSeries, { $inc: { totalTests: 1 } });
    }

    // 4. If no questions supplied, return early
    if (questions.length === 0) {
      return res.status(201).json({
        success: true,
        message: "Test created",
        data: { test, questions: [] },
      });
    }

    // 5. Map section name -> section subdoc _id (now that the Test exists)
    const sectionNameToId = {};
    test.sections.forEach((s) => {
      sectionNameToId[s.name] = s._id;
    });

    // 6. Build question docs; auto-assign order per section if not given
    const orderBySection = {};
    const questionDocs = questions.map((q) => {
      const sectionId = sectionNameToId[q.section];
      const key = String(sectionId);
      if (orderBySection[key] === undefined) orderBySection[key] = 0;
      const order =
        q.order !== undefined && q.order !== null
          ? Number(q.order)
          : orderBySection[key]++;
      return {
        test: test._id,
        section: sectionId,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: Number(q.correctAnswer),
        marks: q.marks !== undefined ? Number(q.marks) : 1,
        explanation: q.explanation ?? "",
        order,
      };
    });

    // 7. Bulk insert questions — roll back the Test on failure
    let insertedQuestions;
    try {
      insertedQuestions = await Question.insertMany(questionDocs, { ordered: true });
    } catch (insertErr) {
      await Test.findByIdAndDelete(test._id);
      if (test.testSeries) {
        await TestSeries.findByIdAndUpdate(test.testSeries, { $inc: { totalTests: -1 } });
      }
      return res.status(400).json({
        success: false,
        message: "Test rolled back — question insert failed",
        error: insertErr.message,
      });
    }

    // 8. Update totalQuestions / totalMarks on the Test
    const totalQuestions = insertedQuestions.length;
    const totalMarks = insertedQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
    const updatedTest = await Test.findByIdAndUpdate(
      test._id,
      { totalQuestions, totalMarks },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: "Test and questions created",
      data: { test: updatedTest, questions: insertedQuestions },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating test with questions",
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
