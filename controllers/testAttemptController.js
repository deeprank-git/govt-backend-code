// controllers/testAttemptController.js

import mongoose from "mongoose";
import TestAttempt from "../models/TestAttempt.js";
import Question from "../models/Question.js";
import Test from "../models/Test.js";

// ---------- helpers ----------

// Score an attempt from its answers and mark it completed/auto-submitted.
// Exported so the cron job (cron/autoSubmitJob.js) can reuse the exact
// same scoring logic instead of re-implementing it.
export const finalizeAttempt = async (attempt, status) => {
  await attempt.populate("answers.question");

  // Fetched independently (rather than via attempt.populate("test", ...)) so this
  // doesn't clobber a `test` population with different fields already present on
  // `attempt` (e.g. getResult populates test with title/duration/totalMarks before
  // this can run via the lazy auto-submit path).
  const test = await Test.findById(attempt.test?._id || attempt.test)
    .select("testSeries")
    .populate("testSeries", "negativeMarking negativeMarksPerQuestion");

  const negativePerQuestion = test?.testSeries?.negativeMarking
    ? test.testSeries.negativeMarksPerQuestion || 0
    : 0;

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;

  attempt.answers.forEach((ans) => {
    if (!ans.question) return; // question may have been removed
    if (ans.isCorrect) {
      score += ans.question.marks || 0;
      correctCount += 1;
    } else {
      score -= negativePerQuestion;
      wrongCount += 1;
    }
  });

  attempt.score = Math.round(score * 100) / 100;
  attempt.correctCount = correctCount;
  attempt.wrongCount = wrongCount;
  attempt.status = status;
  attempt.submittedAt = new Date();

  await attempt.save();
  return attempt;
};

// If the attempt's time is up but it's still "in-progress", auto-submit it.
// This is a lazy check (runs whenever the attempt is touched) rather than a
// background cron job — real-time auto-submit via node-cron is a secondary
// iteration item (see docs section 3, "Auto-submit timer").
const autoSubmitIfExpired = async (attempt) => {
  if (
    attempt.status === "in-progress" &&
    attempt.expiresAt &&
    new Date() > attempt.expiresAt
  ) {
    await finalizeAttempt(attempt, "auto-submitted");
    return true;
  }
  return false;
};

const isOwner = (attempt, req) => String(attempt.user) === String(req.user.id);

// ---------- controllers ----------

// START TEST (or resume an existing in-progress attempt)
export const startTest = async (req, res) => {
  try {
    const { testId } = req.body;

    if (!testId) {
      return res.status(400).json({ success: false, message: "testId is required" });
    }

    const test = await Test.findById(testId);
    if (!test || !test.isActive) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }
    if (req.user.role !== "admin" && !test.isPublished) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    // Resume: if the student already has an in-progress attempt for this test, reuse it.
    let attempt = await TestAttempt.findOne({
      user: req.user.id,
      test: testId,
      status: "in-progress",
    });

    if (attempt) {
      const expired = await autoSubmitIfExpired(attempt);
      if (!expired) {
        return res.status(200).json({
          success: true,
          resumed: true,
          message: "Resuming your in-progress attempt",
          data: attempt,
        });
      }
      // fall through and start a fresh attempt since the old one just expired
    }

    if (!test.totalQuestions || test.totalQuestions === 0) {
      return res.status(400).json({
        success: false,
        message: "This test has no questions yet",
      });
    }

    const startedAt = new Date();
    const expiresAt = new Date(startedAt.getTime() + test.duration * 60 * 1000);

    attempt = await TestAttempt.create({
      user: req.user.id,
      test: testId,
      startedAt,
      expiresAt,
      totalMarks: test.totalMarks,
      currentQuestionIndex: 0,
      status: "in-progress",
    });

    res.status(201).json({ success: true, resumed: false, data: attempt });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error starting test", error: error.message });
  }
};

// GET a question by index within the test (Next / Previous / resume)
export const getQuestionByIndex = async (req, res) => {
  try {
    const attempt = await TestAttempt.findById(req.params.id);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const wasExpired = await autoSubmitIfExpired(attempt);
    if (wasExpired || attempt.status !== "in-progress") {
      return res.status(400).json({
        success: false,
        message: "This attempt has already been submitted",
        status: attempt.status,
      });
    }

    const index = Number(req.params.index);
    if (Number.isNaN(index) || index < 0) {
      return res.status(400).json({ success: false, message: "Invalid question index" });
    }

    const questions = await Question.find({ test: attempt.test, isActive: true })
      .select("-correctAnswer -explanation")
      .sort({ order: 1, createdAt: 1 });

    if (index >= questions.length) {
      return res.status(404).json({
        success: false,
        message: "No question at this index",
        totalQuestions: questions.length,
      });
    }

    const question = questions[index];
    const existingAnswer = attempt.answers.find(
      (a) => String(a.question) === String(question._id)
    );

    attempt.currentQuestionIndex = index;
    await attempt.save();

    res.status(200).json({
      success: true,
      data: {
        question,
        index,
        totalQuestions: questions.length,
        selectedOption: existingAnswer ? existingAnswer.selectedOption : null,
        expiresAt: attempt.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching question", error: error.message });
  }
};

// SAVE ANSWER
export const saveAnswer = async (req, res) => {
  try {
    const { attemptId, questionId, selectedOption } = req.body;

    if (!attemptId || !questionId || selectedOption === undefined) {
      return res.status(400).json({
        success: false,
        message: "attemptId, questionId and selectedOption are required",
      });
    }

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const wasExpired = await autoSubmitIfExpired(attempt);
    if (wasExpired || attempt.status !== "in-progress") {
      return res.status(400).json({
        success: false,
        message: "This attempt has already been submitted",
        status: attempt.status,
      });
    }

    const question = await Question.findById(questionId);
    if (!question || String(question.test) !== String(attempt.test)) {
      return res.status(404).json({ success: false, message: "Question not found for this test" });
    }

    if (selectedOption < 0 || selectedOption >= question.options.length) {
      return res.status(400).json({ success: false, message: "Invalid selectedOption" });
    }

    const isCorrect = question.correctAnswer === selectedOption;

    const existing = attempt.answers.find((a) => String(a.question) === String(questionId));

    if (existing) {
      existing.selectedOption = selectedOption;
      existing.isCorrect = isCorrect;
    } else {
      attempt.answers.push({ question: questionId, selectedOption, isCorrect });
    }

    await attempt.save();

    res.status(200).json({ success: true, message: "Answer saved", isCorrect });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error saving answer", error: error.message });
  }
};

// SUBMIT TEST
export const submitTest = async (req, res) => {
  try {
    const { attemptId } = req.body;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Idempotent: if already submitted (manually or auto), just return the existing result.
    if (attempt.status !== "in-progress") {
      return res.status(200).json({
        success: true,
        message: `Attempt was already ${attempt.status}`,
        data: {
          score: attempt.score,
          totalMarks: attempt.totalMarks,
          correctCount: attempt.correctCount,
          wrongCount: attempt.wrongCount,
          status: attempt.status,
        },
      });
    }

    await finalizeAttempt(attempt, "completed");

    res.status(200).json({
      success: true,
      message: "Test submitted",
      data: {
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        status: attempt.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error submitting test", error: error.message });
  }
};

// GET RESULT (detailed, question-by-question review)
export const getResult = async (req, res) => {
  try {
    const attempt = await TestAttempt.findById(req.params.id).populate({
      path: "test",
      select: "title duration totalMarks totalQuestions testSeries",
      populate: { path: "testSeries", select: "negativeMarking negativeMarksPerQuestion" },
    });
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req) && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await autoSubmitIfExpired(attempt);

    if (attempt.status === "in-progress") {
      return res.status(400).json({
        success: false,
        message: "This attempt has not been submitted yet",
      });
    }

    const questions = await Question.find({ test: attempt.test._id, isActive: true }).sort({
      order: 1,
      createdAt: 1,
    });

    const answerMap = new Map(
      attempt.answers.map((a) => [String(a.question), a])
    );

    const breakdown = questions.map((q) => {
      const ans = answerMap.get(String(q._id));
      return {
        questionId: q._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        selectedOption: ans ? ans.selectedOption : null,
        isCorrect: ans ? ans.isCorrect : false,
        attempted: !!ans,
      };
    });

    const totalMarks = attempt.totalMarks || attempt.test?.totalMarks || 0;
    const percentage = totalMarks > 0 ? Number(((attempt.score / totalMarks) * 100).toFixed(2)) : 0;

    res.status(200).json({
      success: true,
      data: {
        attemptId: attempt._id,
        test: attempt.test,
        status: attempt.status,
        score: attempt.score,
        totalMarks,
        percentage,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        unattempted: questions.length - attempt.answers.length,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        breakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching result", error: error.message });
  }
};

// GET /api/leaderboard/:testId — rank list for a test (best attempt per user)
export const getLeaderboard = async (req, res) => {
  try {
    const { testId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({ success: false, message: "Invalid testId" });
    }

    const test = await Test.findById(testId).select("title totalMarks");
    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    const rows = await TestAttempt.aggregate([
      {
        $match: {
          test: new mongoose.Types.ObjectId(testId),
          status: { $in: ["completed", "auto-submitted"] },
        },
      },
      // best attempt per user: highest score, and among ties the one submitted fastest
      { $sort: { score: -1, submittedAt: 1 } },
      {
        $group: {
          _id: "$user",
          attemptId: { $first: "$_id" },
          score: { $first: "$score" },
          correctCount: { $first: "$correctCount" },
          wrongCount: { $first: "$wrongCount" },
          startedAt: { $first: "$startedAt" },
          submittedAt: { $first: "$submittedAt" },
        },
      },
      { $sort: { score: -1, submittedAt: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: "$userInfo" },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          attemptId: 1,
          name: "$userInfo.name",
          score: 1,
          correctCount: 1,
          wrongCount: 1,
          timeTakenMs: { $subtract: ["$submittedAt", "$startedAt"] },
          submittedAt: 1,
        },
      },
    ]);

    const leaderboard = rows.map((row, i) => ({ rank: i + 1, ...row }));

    res.status(200).json({
      success: true,
      test: { id: test._id, title: test.title, totalMarks: test.totalMarks },
      count: leaderboard.length,
      data: leaderboard,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching leaderboard", error: error.message });
  }
};

// GET MY ATTEMPTS (basic history — used by student dashboard)
export const getMyAttempts = async (req, res) => {
  try {
    const attempts = await TestAttempt.find({ user: req.user.id })
      .populate("test", "title duration totalMarks")
      .sort({ createdAt: -1 })
      .select("test status score correctCount wrongCount startedAt submittedAt");

    res.status(200).json({ success: true, count: attempts.length, data: attempts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching attempts", error: error.message });
  }
};
