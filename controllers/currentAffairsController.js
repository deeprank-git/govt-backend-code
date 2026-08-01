// controllers/currentAffairsController.js

import fs from "fs";
import path from "path";
import CurrentAffairs from "../models/CurrentAffairs.js";
import StreakActivity from "../models/StreakActivity.js";
import User from "../models/Users.js";
import { toUploadUrl } from "../middleware/upload.js";
import { todayUtcMidnight, addUtcDays, isSameUtcDay } from "../utils/dateOnly.js";

// ✅ GET /api/current-affairs?date=&category=&q=
// Students see only published + active entries. Admin sees everything
// (drafts too) so they can preview before publishing.
export const getCurrentAffairs = async (req, res) => {
  try {
    const filter = {};

    if (req.user?.role === "admin") {
      if (req.query.isPublished !== undefined) {
        filter.isPublished = req.query.isPublished === "true";
      }
    } else {
      filter.isPublished = true;
      filter.isActive = true;
    }

    // ?date=2026-07-17 -> everything published that day
    if (req.query.date) {
      const start = new Date(req.query.date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.date = { $gte: start, $lt: end };
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    let query = CurrentAffairs.find(filter);

    // simple text search across title/content/tags, reuses the text index
    if (req.query.q) {
      query = CurrentAffairs.find({ ...filter, $text: { $search: req.query.q } });
    }

    const items = await query
      .sort({ date: -1 })
      .limit(Number(req.query.limit) || 50);

    res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching current affairs",
      error: error.message,
    });
  }
};

// ✅ GET /api/current-affairs/:id — full article, increments view count
export const getCurrentAffairsById = async (req, res) => {
  try {
    const item = await CurrentAffairs.findById(req.params.id);

    if (!item || !item.isActive) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    if (req.user?.role !== "admin" && !item.isPublished) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    item.views += 1;
    await item.save();

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching article",
      error: error.message,
    });
  }
};

// Multipart bodies (needed now that image uploads ride along as a file)
// serialize everything else to strings, so array/boolean fields need explicit
// coercion back — same pattern as testSeriesController's importantDates.
const parseBody = (body) => {
  const { tags, isPublished, ...rest } = body;
  const payload = { ...rest };
  if (tags !== undefined) payload.tags = JSON.parse(tags);
  if (isPublished !== undefined) payload.isPublished = isPublished === "true";
  return payload;
};

// ✅ CREATE (Admin)
export const createCurrentAffairs = async (req, res) => {
  try {
    const payload = { ...parseBody(req.body), createdBy: req.user.id };
    if (req.file) payload.image = toUploadUrl(req.file);

    const item = await CurrentAffairs.create(payload);
    res.status(201).json({ success: true, message: "Article created", data: item });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating article",
      error: error.message,
    });
  }
};

// ✅ UPDATE (Admin)
export const updateCurrentAffairs = async (req, res) => {
  try {
    const payload = parseBody(req.body);

    if (req.file) {
      const existing = await CurrentAffairs.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Article not found" });
      }
      payload.image = toUploadUrl(req.file);
      if (existing.image) {
        fs.unlink(path.join(process.cwd(), existing.image), () => {});
      }
    }

    const updated = await CurrentAffairs.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    res.status(200).json({ success: true, message: "Article updated", data: updated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating article",
      error: error.message,
    });
  }
};

// ✅ RECORD VIEW (streak tracking) — POST /api/current-affairs/:id/record-view
//
// "Today" is always the server's UTC date — we deliberately do not trust a
// client-supplied date here (a client could otherwise fake/extend a streak
// by sending an arbitrary date). Trade-off: a user far from UTC may see
// their streak roll over at a local time other than midnight. Revisit with
// a sanity-checked client-supplied date + timezone if that becomes a
// real complaint.
//
// This is purely additive: it never touches CurrentAffairs.views (see
// getCurrentAffairsById above) or any bookmark logic — streaks are tracked
// entirely on User + StreakActivity.
export const recordCurrentAffairsView = async (req, res) => {
  try {
    const article = await CurrentAffairs.findById(req.params.id);
    if (!article || !article.isActive) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }
    if (req.user.role !== "admin" && !article.isPublished) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    const user = await User.findById(req.user.id);
    const today = todayUtcMidnight();

    // Idempotent per day: a repeat view today doesn't change the streak.
    if (!isSameUtcDay(user.lastActiveDate, today)) {
      const yesterday = addUtcDays(today, -1);
      const continuesStreak = isSameUtcDay(user.lastActiveDate, yesterday);

      user.currentStreak = continuesStreak ? user.currentStreak + 1 : 1;
      user.longestStreak = Math.max(user.longestStreak || 0, user.currentStreak);
      user.lastActiveDate = today;
      await user.save();
    }

    // Log today's activity for the weekly widget. Idempotent via the unique
    // (user, date) index — a duplicate insert (double-click, two tabs) is
    // swallowed rather than erroring.
    try {
      await StreakActivity.create({ user: req.user.id, date: today });
    } catch (logError) {
      if (logError.code !== 11000) throw logError;
    }

    res.status(200).json({
      success: true,
      data: { currentStreak: user.currentStreak, longestStreak: user.longestStreak },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error recording view",
      error: error.message,
    });
  }
};

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// ✅ GET STREAK — GET /api/current-affairs/streak
export const getCurrentAffairsStreak = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("currentStreak longestStreak");

    const today = todayUtcMidnight();
    // Monday-start week: getUTCDay() is 0(Sun)..6(Sat) — shift so Monday = 0.
    const daysSinceMonday = (today.getUTCDay() + 6) % 7;
    const monday = addUtcDays(today, -daysSinceMonday);
    const weekDates = Array.from({ length: 7 }, (_, i) => addUtcDays(monday, i));

    const activity = await StreakActivity.find({
      user: req.user.id,
      date: { $gte: monday, $lte: weekDates[6] },
    }).select("date");
    const activeDayMs = new Set(activity.map((a) => a.date.getTime()));

    const weekActivity = weekDates.map((d, i) => ({
      date: d.toISOString().slice(0, 10),
      label: WEEKDAY_LABELS[i],
      completed: activeDayMs.has(d.getTime()),
    }));

    res.status(200).json({
      success: true,
      data: {
        currentStreak: user?.currentStreak || 0,
        longestStreak: user?.longestStreak || 0,
        weekActivity,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching streak",
      error: error.message,
    });
  }
};

// ✅ DELETE (soft, Admin)
export const deleteCurrentAffairs = async (req, res) => {
  try {
    const deleted = await CurrentAffairs.findByIdAndUpdate(
      req.params.id,
      { isActive: false, isPublished: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    res.status(200).json({ success: true, message: "Article deleted (soft)" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting article",
      error: error.message,
    });
  }
};
