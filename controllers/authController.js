import User from '../models/Users.js';
import RefreshToken from '../models/RefreshToken.js';
import generateToken from '../utils/generateToken.js';
import crypto from 'crypto';

const REFRESH_TOKEN_DAYS = 30;

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

export const registerUser= async(req,res)=>{
    try{
        const {name,email,password,role}=req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "email already registered" });
        }

        const newUser = new User({ name, email, password, role });
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
                role: newUser.role,
                isActive: newUser.isActive
            }
        });
    }catch(error){
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

// ============ SELF-SERVICE (any logged-in user) ============

// GET /api/users/me
export const getMe = async (req, res) => {
    // req.user is already the full user doc (minus password), attached by authMiddleware
    res.status(200).json({ success: true, data: req.user });
};

// PUT /api/users/me — a user can update their own name/email/password.
// role and isActive are intentionally NOT editable here (admin-only, see below).
export const updateMe = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email;
        if (password) user.password = password; // pre('save') hook re-hashes automatically

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        // e.g. duplicate email
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
        const { role, isActive, name, email } = req.body;
        const update = {};

        if (role !== undefined) update.role = role;
        if (isActive !== undefined) update.isActive = isActive;
        if (name !== undefined) update.name = name;
        if (email !== undefined) update.email = email;

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