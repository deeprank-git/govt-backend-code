// controllers/analyticsController.js
//
// GET /api/admin/analytics/overview — a single dashboard-stats endpoint.
// Everything here is derived from data that already exists (Users,
// Category, Test, TestSeries, Question, TestAttempt, Report) — no new
// tracking/events system, just aggregation queries over what's there.

import User from "../models/Users.js";
import Category from "../models/Category.js";
import Test from "../models/Test.js";
import TestSeries from "../models/TestSeries.js";
import Question from "../models/Question.js";
import TestAttempt from "../models/TestAttempt.js";
import Report from "../models/Report.js";
import CurrentAffairs from "../models/CurrentAffairs.js";

export const getAnalyticsOverview = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalStudents,
      totalAdmins,
      totalInstructors,
      blockedUsers,
      newUsersLast7Days,
      totalCategories,
      totalTestSeries,
      totalTests,
      publishedTests,
      totalQuestions,
      totalAttempts,
      inProgressAttempts,
      completedAttempts,
      autoSubmittedAttempts,
      attemptsLast7Days,
      pendingReports,
      totalCurrentAffairs,
      scoreAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "instructor" }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Category.countDocuments({ isActive: true }),
      TestSeries.countDocuments({ isActive: true }),
      Test.countDocuments({ isActive: true }),
      Test.countDocuments({ isActive: true, isPublished: true }),
      Question.countDocuments({ isActive: true }),
      TestAttempt.countDocuments(),
      TestAttempt.countDocuments({ status: "in-progress" }),
      TestAttempt.countDocuments({ status: "completed" }),
      TestAttempt.countDocuments({ status: "auto-submitted" }),
      TestAttempt.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Report.countDocuments({ status: "pending" }),
      CurrentAffairs.countDocuments({ isActive: true }),
      TestAttempt.aggregate([
        { $match: { status: { $in: ["completed", "auto-submitted"] }, totalMarks: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            avgPercentage: { $avg: { $multiply: [{ $divide: ["$score", "$totalMarks"] }, 100] } },
          },
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          students: totalStudents,
          admins: totalAdmins,
          instructors: totalInstructors,
          blocked: blockedUsers,
          newLast7Days: newUsersLast7Days,
        },
        content: {
          categories: totalCategories,
          testSeries: totalTestSeries,
          tests: totalTests,
          publishedTests,
          questions: totalQuestions,
          currentAffairs: totalCurrentAffairs,
        },
        attempts: {
          total: totalAttempts,
          inProgress: inProgressAttempts,
          completed: completedAttempts,
          autoSubmitted: autoSubmittedAttempts,
          last7Days: attemptsLast7Days,
          avgScorePercentage: scoreAgg[0] ? Number(scoreAgg[0].avgPercentage.toFixed(2)) : 0,
        },
        moderation: {
          pendingReports,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching analytics",
      error: error.message,
    });
  }
};
