import User from '../models/Users.js';
import generateToken from '../utils/generateToken.js';

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
        
        res.status(201).json({
            message: 'User registered successfully!',
            token,
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

        const token = generateToken(user._id, user.role);

        res.status(200).json({
            message: 'Login successful!',
            token,
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