// controllers/pageController.js

import Page from "../models/Page.js";

// ✅ GET /api/pages/:slug — public, only published pages
export const getPageBySlug = async (req, res) => {
  try {
    const page = await Page.findOne({ slug: req.params.slug, status: "published" });

    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    res.status(200).json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching page",
      error: error.message,
    });
  }
};

// ✅ GET /api/admin/pages — admin sees drafts too
export const getAllPagesAdmin = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const pages = await Page.find(filter).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, count: pages.length, data: pages });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pages",
      error: error.message,
    });
  }
};

// ✅ CREATE (Admin)
export const createPage = async (req, res) => {
  try {
    const { slug, title, content, status } = req.body;

    const exists = await Page.findOne({ slug });
    if (exists) {
      return res.status(400).json({ success: false, message: "A page with this slug already exists" });
    }

    const page = await Page.create({
      slug,
      title,
      content,
      status,
      updatedBy: req.user.id,
    });

    res.status(201).json({ success: true, message: "Page created", data: page });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating page",
      error: error.message,
    });
  }
};

// ✅ UPDATE (Admin)
export const updatePage = async (req, res) => {
  try {
    const updated = await Page.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    res.status(200).json({ success: true, message: "Page updated", data: updated });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating page",
      error: error.message,
    });
  }
};

// ✅ DELETE (Admin) — pages are few and static, so a real delete is fine here
export const deletePage = async (req, res) => {
  try {
    const deleted = await Page.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }

    res.status(200).json({ success: true, message: "Page deleted" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting page",
      error: error.message,
    });
  }
};
