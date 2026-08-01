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
    if (!ans.question || !ans.question.isActive) return; // question removed or soft-deleted since being answered
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

// Seconds left on an attempt's timer, accounting for time spent paused.
// Total duration is derived from (expiresAt - startedAt) rather than a
// separate stored field — expiresAt is set once at start and never moves,
// so it's already the single source of truth for "how long was this test".
//
// While paused, "now" is pinned to pausedAt instead of the real clock, which
// is what freezes the displayed value — totalPausedDurationMs and pausedAt
// don't change again until resume(), so this returns the same number on
// every call for as long as the attempt stays paused.
export const computeRemainingSeconds = (attempt) => {
  if (!attempt.expiresAt || !attempt.startedAt) return 0;

  const totalPausedMs = attempt.totalPausedDurationMs || 0;
  const nowMs =
    attempt.status === "paused" && attempt.pausedAt
      ? attempt.pausedAt.getTime()
      : Date.now();

  const effectiveExpiresAtMs = attempt.expiresAt.getTime() + totalPausedMs;
  return Math.max(0, Math.floor((effectiveExpiresAtMs - nowMs) / 1000));
};

// If the attempt's effective time is up but it's still "in-progress", auto-submit
// it. This is a lazy check (runs whenever the attempt is touched) rather than a
// background cron job — real-time auto-submit via node-cron is a secondary
// iteration item (see docs section 3, "Auto-submit timer"). Deliberately only
// fires for "in-progress": a "paused" attempt must never be auto-submitted
// while paused, no matter how long it's been paused for.
const autoSubmitIfExpired = async (attempt) => {
  if (attempt.status === "in-progress" && computeRemainingSeconds(attempt) <= 0) {
    await finalizeAttempt(attempt, "auto-submitted");
    return true;
  }
  return false;
};

const isOwner = (attempt, req) => String(attempt.user) === String(req.user.id);

// Guard for write actions (answering a question, submitting): the attempt
// must be actively "in-progress". Distinguishes the "paused" case with its
// own clear message so a stale tab can't sneak in an answer while paused
// and get a confusing "already submitted" error instead.
const guardWritable = async (attempt) => {
  if (attempt.status === "paused") {
    return {
      status: 400,
      body: {
        success: false,
        message: "This attempt is paused. Resume it before continuing.",
        status: "paused",
      },
    };
  }

  const wasExpired = await autoSubmitIfExpired(attempt);
  if (wasExpired || attempt.status !== "in-progress") {
    return {
      status: 400,
      body: {
        success: false,
        message: "This attempt has already been submitted",
        status: attempt.status,
      },
    };
  }

  return null;
};

// Guard for read/navigation actions (loading a question): "paused" is fine —
// the point of pausing is that the student can still see where they left
// off with a frozen timer, they just can't write new answers (see
// guardWritable above). Only a genuinely-ended attempt is rejected.
const guardActive = async (attempt) => {
  if (attempt.status === "paused") return null;

  const wasExpired = await autoSubmitIfExpired(attempt);
  if (wasExpired || attempt.status !== "in-progress") {
    return {
      status: 400,
      body: {
        success: false,
        message: "This attempt has already been submitted",
        status: attempt.status,
      },
    };
  }

  return null;
};

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

    // Resume: if the student already has an in-progress OR paused attempt for
    // this test, reuse it — a paused attempt must never be silently
    // superseded by a fresh one just because the student reopened the page.
    let attempt = await TestAttempt.findOne({
      user: req.user.id,
      test: testId,
      status: { $in: ["in-progress", "paused"] },
    });

    if (attempt) {
      // autoSubmitIfExpired is a no-op for "paused" by design (see its
      // definition), so this only ever finalizes a genuinely-expired
      // in-progress attempt.
      const expired = await autoSubmitIfExpired(attempt);
      if (!expired) {
        return res.status(200).json({
          success: true,
          resumed: true,
          message:
            attempt.status === "paused"
              ? "You have a paused attempt for this test — resume it to continue"
              : "Resuming your in-progress attempt",
          data: { ...attempt.toObject(), remainingSeconds: computeRemainingSeconds(attempt) },
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

    try {
      attempt = await TestAttempt.create({
        user: req.user.id,
        test: testId,
        startedAt,
        expiresAt,
        totalMarks: test.totalMarks,
        currentQuestionIndex: 0,
        status: "in-progress",
      });
    } catch (createError) {
      // Lost a race to a concurrent /start (or /pause) request — one of the
      // partial unique indexes on (user, test, status: "in-progress"/"paused")
      // rejected this insert because the other request's attempt now exists.
      // Reuse it instead of erroring.
      if (createError.code === 11000) {
        attempt = await TestAttempt.findOne({
          user: req.user.id,
          test: testId,
          status: { $in: ["in-progress", "paused"] },
        });
        if (attempt) {
          return res.status(200).json({
            success: true,
            resumed: true,
            message:
              attempt.status === "paused"
                ? "You have a paused attempt for this test — resume it to continue"
                : "Resuming your in-progress attempt",
            data: { ...attempt.toObject(), remainingSeconds: computeRemainingSeconds(attempt) },
          });
        }
      }
      throw createError;
    }

    await Test.findByIdAndUpdate(testId, { $inc: { attemptsCount: 1 } });

    res.status(201).json({
      success: true,
      resumed: false,
      data: { ...attempt.toObject(), remainingSeconds: computeRemainingSeconds(attempt) },
    });
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

    const guardError = await guardActive(attempt);
    if (guardError) {
      return res.status(guardError.status).json(guardError.body);
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

    // Don't persist navigation state while paused — nothing about the
    // attempt should be written to until it's explicitly resumed.
    if (attempt.status === "in-progress") {
      attempt.currentQuestionIndex = index;
      await attempt.save();
    }

    res.status(200).json({
      success: true,
      data: {
        question,
        index,
        totalQuestions: questions.length,
        selectedOption: existingAnswer ? existingAnswer.selectedOption : null,
        expiresAt: attempt.expiresAt,
        status: attempt.status,
        remainingSeconds: computeRemainingSeconds(attempt),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching question", error: error.message });
  }
};

// PAUSE ATTEMPT
export const pauseAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Resolve a genuinely-expired-but-still-"in-progress" attempt first, so
    // we don't pause something that has actually already timed out.
    const wasExpired = await autoSubmitIfExpired(attempt);
    if (wasExpired) {
      return res.status(400).json({
        success: false,
        message: "This attempt has already ended",
        status: attempt.status,
      });
    }

    if (attempt.status !== "in-progress") {
      return res.status(400).json({
        success: false,
        message: `Cannot pause an attempt with status "${attempt.status}"`,
        status: attempt.status,
      });
    }

    // Optional, admin-configured abuse guards (see models/Test.js). Both
    // default to null/unlimited, so this is a no-op unless a test opts in.
    const test = await Test.findById(attempt.test).select("maxPauses maxPauseDurationMs");
    if (test?.maxPauses != null && attempt.pauseCount >= test.maxPauses) {
      return res.status(400).json({
        success: false,
        message: `Maximum number of pauses (${test.maxPauses}) reached for this attempt`,
      });
    }
    if (test?.maxPauseDurationMs != null && attempt.totalPausedDurationMs >= test.maxPauseDurationMs) {
      return res.status(400).json({
        success: false,
        message: "Maximum total paused time reached for this attempt",
      });
    }

    attempt.status = "paused";
    attempt.pausedAt = new Date();
    attempt.pauseCount += 1;
    await attempt.save();

    res.status(200).json({
      success: true,
      message: "Attempt paused",
      data: { status: attempt.status, remainingSeconds: computeRemainingSeconds(attempt) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error pausing attempt", error: error.message });
  }
};

// RESUME ATTEMPT
export const resumeAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (!isOwner(attempt, req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (attempt.status !== "paused") {
      return res.status(400).json({
        success: false,
        message: `Cannot resume an attempt with status "${attempt.status}"`,
        status: attempt.status,
      });
    }

    const pausedMs = Date.now() - attempt.pausedAt.getTime();
    attempt.totalPausedDurationMs = (attempt.totalPausedDurationMs || 0) + pausedMs;
    attempt.pausedAt = null;
    attempt.status = "in-progress";
    await attempt.save();

    // Edge case: if the accumulated paused time still leaves the timer
    // already exhausted the moment we resume, auto-submit immediately
    // instead of handing back a negative-feeling 0-second "in-progress" attempt.
    await autoSubmitIfExpired(attempt);

    res.status(200).json({
      success: true,
      message: attempt.status === "in-progress" ? "Attempt resumed" : "Attempt auto-submitted (time was already up)",
      data: { status: attempt.status, remainingSeconds: computeRemainingSeconds(attempt) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error resuming attempt", error: error.message });
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

    const guardError = await guardWritable(attempt);
    if (guardError) {
      return res.status(guardError.status).json(guardError.body);
    }

    const question = await Question.findOne({ _id: questionId, isActive: true });
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

    // Can't submit while paused — resume first (same reasoning as
    // save-answer: no writes to the attempt while paused). Checked before
    // the idempotent "already submitted" branch below, since "paused" would
    // otherwise fall into `status !== "in-progress"` and be misreported as
    // an already-finished attempt.
    if (attempt.status === "paused") {
      return res.status(400).json({
        success: false,
        message: "This attempt is paused. Resume it before submitting.",
        status: "paused",
      });
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

    // "paused" must be treated the same as "in-progress" here — it's not a
    // terminal status, so there's no result to show yet. Without this,
    // a paused attempt would fall through and get scored/returned as if it
    // had actually finished (only "in-progress" was excluded before "paused"
    // existed as a separate status).
    if (attempt.status === "in-progress" || attempt.status === "paused") {
      return res.status(400).json({
        success: false,
        message: "This attempt has not been submitted yet",
        status: attempt.status,
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
        // Derived from the breakdown (scoped to currently-active questions) rather
        // than attempt.answers.length, which can include answers for questions
        // that were soft-deleted after being answered and would otherwise make
        // this go negative.
        unattempted: breakdown.filter((b) => !b.attempted).length,
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

    const test = await Test.findById(testId).select("title totalMarks isActive isPublished");
    if (!test || !test.isActive) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }
    if (req.user?.role !== "admin" && !test.isPublished) {
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
      .populate({
        path: "test",
        select: "title duration totalMarks testSeries",
        populate: { path: "testSeries", select: "name image" },
      })
      .sort({ createdAt: -1 })
      .select("test status score correctCount wrongCount startedAt submittedAt");

    res.status(200).json({ success: true, count: attempts.length, data: attempts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching attempts", error: error.message });
  }
};
