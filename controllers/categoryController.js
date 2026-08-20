// controllers/category.controller.js

import fs from "fs";
import path from "path";
import Category from "../models/Category.js";
import { toUploadUrl } from "../middleware/upload.js";

// ✅ GET all categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .select("name slug image order")
      .sort({ order: 1, name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};

// ✅ GET single category
export const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();

    if (!category || !category.isActive) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category",
      error: error.message,
    });
  }
};

// ✅ CREATE category (Admin)
export const createCategory = async (req, res) => {
  try {
    const { name, description, order } = req.body;

    const category = await Category.create({
      name,
      description,
      image: req.file ? toUploadUrl(req.file) : "",
      ...(order !== undefined && { order: Number(order) }),
    });

    res.status(201).json({
      success: true,
      message: "Category created",
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating category",
      error: error.message,
    });
  }
};

// ✅ UPDATE category (Admin)
export const updateCategory = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (req.file) {
      const existing = await Category.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }
      payload.image = toUploadUrl(req.file);
      if (existing.image) {
        fs.unlink(path.join(process.cwd(), existing.image), () => {});
      }
    }

    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category updated",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating category",
      error: error.message,
    });
  }
};

// ✅ DELETE category (soft delete)
export const deleteCategory = async (req, res) => {
  try {
    const deleted = await Category.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category deleted (soft)",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: error.message,
    });
  }
};