// controllers/questionController.js

import { parse } from "csv-parse/sync";
import Question from "../models/Question.js";
import Test from "../models/Test.js";

// Columns the bulk-upload CSV template ships with, and that bulkCreateQuestions
// expects on the way back in. correctAnswer is 1-based here (matches option1..4)
// since that's what a non-technical admin filling the sheet in Excel expects —
// it's converted to the stored 0-based index during parsing.
const CSV_COLUMNS = [
  "test",
  "section",
  "questionText",
  "option1",
  "option2",
  "option3",
  "option4",
  "correctAnswer",
  "marks",
  "explanation",
  "order",
];

const CSV_EXAMPLE_ROW = [
  "PASTE_TEST_ID_HERE",
  "General Awareness",
  "What is the capital of India?",
  "Mumbai",
  "New Delhi",
  "Kolkata",
  "Chennai",
  "2",
  "1",
  "New Delhi is the capital of India.",
  "",
];

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
    const { test, section } = req.body;

    if (!test) {
      return res.status(400).json({
        success: false,
        message: "test (Test ID) is required",
      });
    }
    if (!section) {
      return res.status(400).json({
        success: false,
        message: "section (section ID) is required",
      });
    }

    const testDoc = await Test.findById(test);
    if (!testDoc) {
      return res.status(400).json({
        success: false,
        message: "test not found",
      });
    }
    if (!testDoc.sections.id(section)) {
      return res.status(400).json({
        success: false,
        message: "section does not belong to this test",
      });
    }

    // auto-assign order as next in sequence within this test's section, unless explicitly given
    let order = req.body.order;
    if (order === undefined || order === null) {
      const count = await Question.countDocuments({ test, section });
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

    const filter = { test: req.query.test, isActive: true };
    if (req.query.section) filter.section = req.query.section;

    const questions = await Question.find(filter)
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
    if (req.query.section) filter.section = req.query.section;

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

// GET /api/admin/questions/bulk/template — downloadable sample CSV with the
// expected header row, so a non-technical admin can fill it in and re-upload
// instead of having to write raw JSON.
export const downloadBulkTemplate = (req, res) => {
  const csv = [CSV_COLUMNS.join(","), CSV_EXAMPLE_ROW.join(",")].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="questions-template.csv"');
  res.status(200).send(csv);
};

// BULK CREATE QUESTIONS — from an uploaded CSV file (field name "file")
export const bulkCreateQuestions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "CSV file is required (field name: file)",
      });
    }

    let rows;
    try {
      rows = parse(req.file.buffer, {
        columns: true,
        trim: true,
        skip_empty_lines: true,
      });
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: "Could not parse CSV file",
        error: parseError.message,
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "CSV file has no data rows",
      });
    }

    // 1. Validate each row and build the question objects to insert.
    //    rowNumber accounts for the header row so it matches what the admin
    //    sees when they open the CSV in a spreadsheet app.
    const testCache = {}; // testId -> Test doc, so repeated rows for the same test don't refetch
    const nextOrderByTestSection = {}; // `${testId}:${sectionId}` -> next order
    const questions = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      const options = [row.option1, row.option2, row.option3, row.option4];

      if (!row.test || !row.section || !row.questionText || options.some((opt) => !opt)) {
        return res.status(400).json({
          success: false,
          message: `Row ${rowNumber}: test, section, questionText and all 4 options are required`,
        });
      }

      if (testCache[row.test] === undefined) {
        testCache[row.test] = await Test.findById(row.test);
      }
      const testDoc = testCache[row.test];
      if (!testDoc) {
        return res.status(400).json({
          success: false,
          message: `Row ${rowNumber}: test "${row.test}" not found`,
        });
      }

      const sectionDoc = testDoc.sections.find((s) => s.name === row.section);
      if (!sectionDoc) {
        return res.status(400).json({
          success: false,
          message: `Row ${rowNumber}: section "${row.section}" does not belong to test "${row.test}"`,
        });
      }
      const sectionId = sectionDoc._id;

      const correctAnswer = Number(row.correctAnswer) - 1; // CSV is 1-based
      if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
        return res.status(400).json({
          success: false,
          message: `Row ${rowNumber}: correctAnswer must be a number from 1 to 4`,
        });
      }

      let order;
      if (row.order !== undefined && row.order !== "") {
        order = Number(row.order);
      } else {
        const key = `${row.test}:${sectionId}`;
        if (nextOrderByTestSection[key] === undefined) {
          nextOrderByTestSection[key] = await Question.countDocuments({ test: row.test, section: sectionId });
        }
        order = nextOrderByTestSection[key];
        nextOrderByTestSection[key] += 1;
      }

      questions.push({
        test: row.test,
        section: sectionId,
        questionText: row.questionText,
        options: options.map((text) => ({ text })),
        correctAnswer,
        marks: row.marks !== undefined && row.marks !== "" ? Number(row.marks) : 1,
        explanation: row.explanation || "",
        order,
      });
    }

    // 2. Insert all questions
    const insertedQuestions = await Question.insertMany(questions);

    // 3. Recalculate totals for every affected test
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
