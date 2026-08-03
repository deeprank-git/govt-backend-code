import fs from 'fs';
import path from 'path';
import User from '../models/Users.js';
import RefreshToken from '../models/RefreshToken.js';
import generateToken from '../utils/generateToken.js';
import crypto from 'crypto';
import { sendPasswordResetOtpEmail } from '../utils/emailService.js';
import { toUploadUrl } from '../middleware/upload.js';

// Mongo duplicate-key error (e.g. email or username already taken) —
// surfaced as a 400 with the offending field name instead of a generic 500.
const isDuplicateKeyError = (error) => error.code === 11000;
const duplicateKeyField = (error) => Object.keys(error.keyPattern || {})[0] || "field";

const REFRESH_TOKEN_DAYS = 30;
const RESET_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_OTP_MAX_ATTEMPTS = 5;

// Issues a long-lived refresh token, stores it in Mongo (so it can be
// revoked / rotated / listed per-device), and returns the raw string to
// send back to the client. Kept here rather than in utils/ since it's
// only ever used from this file's auth flows.
const issueRefreshToken = async (userId, device = "") => {
    const token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({ user: userId, token, expiresAt, device });
    return token;
};

// Registration only collects the essentials. username, profilePicture,
// address, country and city are filled in afterwards via PUT /api/users/me
// (see updateMe below) as a separate "complete your profile" step.
export const registerUser= async(req,res)=>{
    try{
        const {name,email,mobile,password,role}=req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "email already registered" });
        }

        const newUser = new User({ name, email, mobile, password, role });
        await newUser.save();
        const token = generateToken(newUser._id, newUser.role);
        const refreshToken = await issueRefreshToken(newUser._id, req.headers["user-agent"]);

        res.status(201).json({
            message: 'User registered successfully!',
            token,
            refreshToken,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                mobile: newUser.mobile,
                role: newUser.role,
                isActive: newUser.isActive
            }
        });
    }catch(error){
        if (isDuplicateKeyError(error)) {
            return res.status(400).json({ message: `${duplicateKeyField(error)} already taken` });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Your account has been deactivated by an admin' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id, user.role);
        const refreshToken = await issueRefreshToken(user._id, req.headers["user-agent"]);

        res.status(200).json({
            message: 'Login successful!',
            token,
            refreshToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                username: user.username,
                profilePicture: user.profilePicture,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

// POST /api/auth/refresh — exchange a still-valid refresh token for a new
// access token. Rotates the refresh token too (old one is revoked, a new
// one issued) so a leaked-but-unused refresh token has a short window.
export const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, message: "refreshToken is required" });
        }

        const stored = await RefreshToken.findOne({ token: refreshToken });

        if (!stored || stored.revoked || stored.expiresAt < new Date()) {
            return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
        }

        const user = await User.findById(stored.user);
        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, message: "Account not available" });
        }

        // rotate: revoke the used one, issue a fresh one
        stored.revoked = true;
        await stored.save();
        const newRefreshToken = await issueRefreshToken(user._id, stored.device);

        const token = generateToken(user._id, user.role);

        res.status(200).json({ success: true, token, refreshToken: newRefreshToken });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// POST /api/auth/logout — revoke a single refresh token (this device only).
export const logoutUser = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, message: "refreshToken is required" });
        }

        await RefreshToken.findOneAndUpdate({ token: refreshToken }, { revoked: true });

        res.status(200).json({ success: true, message: "Logged out" });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// POST /api/auth/forgot-password — always returns the same generic message,
// whether or not the email is registered, so this endpoint can't be used to
// enumerate accounts. The raw OTP is only ever sent by email; the DB only
// ever stores its sha256 hash.
export const forgotPassword = async (req, res) => {
    const genericResponse = {
        success: true,
        message: "If an account with that email exists, a password reset code has been sent.",
    };

    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json(genericResponse);
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        user.resetPasswordOtp = crypto.createHash("sha256").update(otp).digest("hex");
        user.resetPasswordOtpExpires = new Date(Date.now() + RESET_OTP_TTL_MS);
        user.resetPasswordOtpAttempts = 0;
        await user.save();

        try {
            await sendPasswordResetOtpEmail(user.email, otp);
        } catch (emailError) {
            // Don't leak email-delivery failures to the client — same generic response either way.
            console.error("Failed to send password reset OTP email:", emailError);
        }

        res.status(200).json(genericResponse);
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// POST /api/auth/reset-password — verifies the emailed OTP and sets the new
// password in one step. The OTP is consumed (and its attempt counter reset)
// on success so it can't be replayed; wrong guesses count against
// RESET_OTP_MAX_ATTEMPTS so a 6-digit code can't just be brute-forced within
// its 10-minute window.
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "email, otp and newPassword are required" });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ email }).select(
            "+resetPasswordOtp +resetPasswordOtpExpires +resetPasswordOtpAttempts"
        );

        if (!user || !user.resetPasswordOtp || !user.resetPasswordOtpExpires || user.resetPasswordOtpExpires < new Date()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        if (user.resetPasswordOtpAttempts >= RESET_OTP_MAX_ATTEMPTS) {
            return res.status(400).json({ success: false, message: "Too many incorrect attempts. Please request a new OTP." });
        }

        const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
        if (hashedOtp !== user.resetPasswordOtp) {
            user.resetPasswordOtpAttempts += 1;
            await user.save();
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        user.password = newPassword; // pre('save') hook re-hashes automatically
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpires = undefined;
        user.resetPasswordOtpAttempts = 0;
        await user.save();

        res.status(200).json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============ SELF-SERVICE (any logged-in user) ============

// GET /api/users/me
export const getMe = async (req, res) => {
    // req.user is already the full user doc (minus password), attached by authMiddleware
    res.status(200).json({ success: true, data: req.user });
};

// PUT /api/users/me — a user can update their own profile: name/email/mobile
// /password plus username, address, country, city and profile picture.
// role and isActive are intentionally NOT editable here (admin-only, see below).
// Changing the password requires the correct currentPassword — this is the
// logged-in "change password" flow, distinct from the OTP-based forgot-password
// flow below (which proves identity via email access instead).
export const updateMe = async (req, res) => {
    try {
        const { name, email, mobile, username, address, country, city, password, currentPassword } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email;
        if (mobile !== undefined) user.mobile = mobile;
        if (username !== undefined) user.username = username;
        if (address !== undefined) user.address = address;
        if (country !== undefined) user.country = country;
        if (city !== undefined) user.city = city;

        if (password) {
            if (!currentPassword) {
                return res.status(400).json({ success: false, message: "Current password is required to set a new password" });
            }
            if (password.length < 6) {
                return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
            }
            const isMatch = await user.comparePassword(currentPassword);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Current password is incorrect" });
            }
            user.password = password; // pre('save') hook re-hashes automatically
        }

        // New profile picture uploaded — swap it in and best-effort clean up the old file.
        if (req.file) {
            const previousPicture = user.profilePicture;
            user.profilePicture = toUploadUrl(req.file);

            if (previousPicture) {
                const previousPath = path.join(process.cwd(), previousPicture);
                fs.unlink(previousPath, () => {});
            }
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                username: user.username,
                profilePicture: user.profilePicture,
                address: user.address,
                country: user.country,
                city: user.city,
                role: user.role,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return res.status(400).json({ success: false, message: `${duplicateKeyField(error)} already taken` });
        }
        res.status(500).json({ success: false, message: "Error updating profile", error: error.message });
    }
};

// ============ ADMIN USER MANAGEMENT ============

// GET /api/admin/users?role=&isActive=
export const getAllUsers = async (req, res) => {
    try {
        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

        const users = await User.find(filter).select("-password").sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching users", error: error.message });
    }
};

// GET /api/admin/users/:id
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching user", error: error.message });
    }
};

// PATCH /api/admin/users/:id — admin can change role and/or block/unblock (isActive)
export const updateUserByAdmin = async (req, res) => {
    try {
        const { role, isActive, name, email, mobile } = req.body;
        const update = {};

        if (role !== undefined) update.role = role;
        if (isActive !== undefined) update.isActive = isActive;
        if (name !== undefined) update.name = name;
        if (email !== undefined) update.email = email;
        if (mobile !== undefined) update.mobile = mobile;

        const user = await User.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true,
        }).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({ success: true, message: "User updated", data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating user", error: error.message });
    }
};