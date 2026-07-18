// controllers/reportController.js

import Report from "../models/Report.js";
import Question from "../models/Question.js";

// ✅ POST /api/users/me/report-question — student flags a question as wrong
export const reportQuestion = async (req, res) => {
  try {
    const { questionId, reason } = req.body;

    if (!questionId || !reason) {
      return res.status(400).json({
        success: false,
        message: "questionId and reason are required",
      });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const report = await Report.create({
      user: req.user.id,
      question: questionId,
      test: question.test,
      reason,
    });

    res.status(201).json({ success: true, message: "Report submitted", data: report });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error submitting report",
      error: error.message,
    });
  }
};

// ✅ GET /api/admin/reports?status=
export const getReports = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const reports = await Report.find(filter)
      .populate("user", "name email")
      .populate("question", "questionText")
      .populate("test", "title")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reports",
      error: error.message,
    });
  }
};

// ✅ PATCH /api/admin/reports/:id — mark reviewed/resolved, leave a note
export const updateReport = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const update = {};

    if (status !== undefined) update.status = status;
    if (adminNote !== undefined) update.adminNote = adminNote;
    if (status && status !== "pending") update.resolvedBy = req.user.id;

    const report = await Report.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    res.status(200).json({ success: true, message: "Report updated", data: report });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating report",
      error: error.message,
    });
  }
};
