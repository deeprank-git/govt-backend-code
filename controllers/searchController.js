// controllers/searchController.js
//
// GET /api/search?q= — a single global search box, as scoped in the
// original doc's main feature list ("Search — search box to find
// tests, exams, notes"). Runs a lightweight regex search across
// Category, Test, TestSeries and CurrentAffairs in parallel and
// returns everything grouped by type, capped per type so the box
// doesn't return an overwhelming wall of results.

import Category from "../models/Category.js";
import Test from "../models/Test.js";
import TestSeries from "../models/TestSeries.js";
import CurrentAffairs from "../models/CurrentAffairs.js";

const PER_TYPE_LIMIT = 10;

export const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, message: "Query param q is required" });
    }

    const regex = new RegExp(q.trim(), "i");

    const [categories, tests, testSeries, currentAffairs] = await Promise.all([
      Category.find({ name: regex, isActive: true })
        .select("name slug image")
        .limit(PER_TYPE_LIMIT)
        .lean(),

      Test.find({ title: regex, isActive: true, isPublished: true })
        .select("title description category testSeries duration")
        .limit(PER_TYPE_LIMIT)
        .lean(),

      TestSeries.find({ name: regex, isActive: true, isPublished: true })
        .select("name description category")
        .limit(PER_TYPE_LIMIT)
        .lean(),

      CurrentAffairs.find({
        isActive: true,
        isPublished: true,
        $or: [{ title: regex }, { tags: regex }],
      })
        .select("title summary date category")
        .limit(PER_TYPE_LIMIT)
        .lean(),
    ]);

    const totalResults =
      categories.length + tests.length + testSeries.length + currentAffairs.length;

    res.status(200).json({
      success: true,
      query: q,
      totalResults,
      data: {
        categories,
        tests,
        testSeries,
        currentAffairs,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error performing search",
      error: error.message,
    });
  }
};
