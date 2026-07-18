// controllers/notificationController.js

import Notification from "../models/Notification.js";

// ✅ GET /api/notifications/me — targeted notifications + broadcasts, newest first
export const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      $or: [{ user: req.user.id }, { user: null }],
    })
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 50);

    // Broadcasts don't carry a personal isRead flag (see model note), so
    // derive it per-request from readBy instead of trusting the field.
    const data = notifications.map((n) => {
      const obj = n.toObject();
      if (obj.user === null) {
        obj.isRead = n.readBy.some((id) => String(id) === String(req.user.id));
      }
      delete obj.readBy;
      return obj;
    });

    const unreadCount = data.filter((n) => !n.isRead).length;

    res.status(200).json({ success: true, count: data.length, unreadCount, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};

// ✅ PATCH /api/notifications/:id/read
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    // must be either the targeted recipient or it must be a broadcast
    const isMine = notification.user && String(notification.user) === String(req.user.id);
    const isBroadcast = notification.user === null;
    if (!isMine && !isBroadcast) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (isBroadcast) {
      if (!notification.readBy.some((id) => String(id) === String(req.user.id))) {
        notification.readBy.push(req.user.id);
      }
    } else {
      notification.isRead = true;
    }

    await notification.save();

    res.status(200).json({ success: true, message: "Marked as read" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating notification",
      error: error.message,
    });
  }
};

// ✅ POST /api/admin/notifications — targeted (userId set) or broadcast (omit userId)
export const createNotification = async (req, res) => {
  try {
    const { userId, title, message, type } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "title and message are required",
      });
    }

    const notification = await Notification.create({
      user: userId || null,
      title,
      message,
      type,
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, message: "Notification sent", data: notification });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating notification",
      error: error.message,
    });
  }
};

// ✅ GET /api/admin/notifications — admin view of everything sent
export const getAllNotificationsAdmin = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100);

    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};
