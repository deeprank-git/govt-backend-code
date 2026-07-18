// controllers/currentAffairsController.js

import CurrentAffairs from "../models/CurrentAffairs.js";

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
      .select("-content") // list view: skip the full body, keep it light
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

// ✅ CREATE (Admin)
export const createCurrentAffairs = async (req, res) => {
  try {
    const item = await CurrentAffairs.create({ ...req.body, createdBy: req.user.id });
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
    const updated = await CurrentAffairs.findByIdAndUpdate(req.params.id, req.body, {
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
