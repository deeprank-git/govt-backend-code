// controllers/questionController.js

import Question from "../models/Question.js";
import Test from "../models/Test.js";

// 🔁 Recalculate a Test's totalQuestions & totalMarks from its active questions.
// Called after any question create/update/delete so Test stays in sync,
// per docs: "totalMarks, totalQuestions -- Auto-calculated when questions are added"
const recalcTestTotals = async (testId) => {
  if (!testId) return;

  const questions = await Question.find({ test: testId, isActive: true }).select(
    "marks"
  );

  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  await Test.findByIdAndUpdate(testId, { totalQuestions, totalMarks });
};

// CREATE
export const createQuestion = async (req, res) => {
  try {
    const { test } = req.body;

    if (!test) {
      return res.status(400).json({
        success: false,
        message: "test (Test ID) is required",
      });
    }

    // auto-assign order as next in sequence for this test, unless explicitly given
    let order = req.body.order;
    if (order === undefined || order === null) {
      const count = await Question.countDocuments({ test });
      order = count;
    }

    const question = await Question.create({ ...req.body, order });

    await recalcTestTotals(test);

    res.status(201).json({
      success: true,
      message: "Question created",
      data: question,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating question",
      error: error.message,
    });
  }
};

// UPDATE (Admin)
export const updateQuestion = async (req, res) => {
  try {
    const updated = await Question.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    await recalcTestTotals(updated.test);

    res.status(200).json({
      success: true,
      message: "Question updated",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating question",
      error: error.message,
    });
  }
};

// DELETE (soft, Admin)
export const deleteQuestion = async (req, res) => {
  try {
    const deleted = await Question.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    await recalcTestTotals(deleted.test);

    res.status(200).json({
      success: true,
      message: "Question deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting question",
      error: error.message,
    });
  }
};

// GET by test (Student) — ordered, answers hidden
export const getQuestionsByTest = async (req, res) => {
  try {
    if (!req.query.test) {
      return res.status(400).json({
        success: false,
        message: "test query param is required",
      });
    }

    const questions = await Question.find({
      test: req.query.test,
      isActive: true,
    })
      .select("-correctAnswer -explanation")
      .sort({ order: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching questions",
      error: error.message,
    });
  }
};

// ADMIN VIEW (with answers)
export const getQuestionsAdmin = async (req, res) => {
  try {
    const filter = {};
    if (req.query.test) filter.test = req.query.test;

    const questions = await Question.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching questions",
      error: error.message,
    });
  }
};

// BULK CREATE QUESTIONS
export const bulkCreateQuestions = async (req, res) => {
  try {
    const questions = req.body;

    // 1. Basic validation
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a non-empty array",
      });
    }

    // 2. Validate each question, and auto-assign order per test
    const nextOrderByTest = {};

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q.questionText || !q.options || q.correctAnswer === undefined || !q.test) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields in question at index ${i}`,
        });
      }

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return res.status(400).json({
          success: false,
          message: `Question at index ${i} must have exactly 4 options`,
        });
      }

      if (q.correctAnswer < 0 || q.correctAnswer > 3) {
        return res.status(400).json({
          success: false,
          message: `Invalid correctAnswer index at question ${i}`,
        });
      }

      if (q.order === undefined || q.order === null) {
        if (nextOrderByTest[q.test] === undefined) {
          nextOrderByTest[q.test] = await Question.countDocuments({ test: q.test });
        }
        q.order = nextOrderByTest[q.test];
        nextOrderByTest[q.test] += 1;
      }
    }

    // 3. Insert all questions
    const insertedQuestions = await Question.insertMany(questions);

    // 4. Recalculate totals for every affected test
    const affectedTestIds = [...new Set(insertedQuestions.map((q) => String(q.test)))];
    await Promise.all(affectedTestIds.map((testId) => recalcTestTotals(testId)));

    res.status(201).json({
      success: true,
      message: `${insertedQuestions.length} questions uploaded successfully`,
      data: insertedQuestions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Bulk upload failed",
      error: error.message,
    });
  }
};
