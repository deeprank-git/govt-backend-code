import jwt from "jsonwebtoken";
import User from "../models/Users.js";

const authMiddleware = async (req, res, next) => {
    try {

        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Access denied. No token provided."
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({
                message: "User not found"
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                message: "Your account has been deactivated by an admin"
            });
        }

        req.user = user;

        next();

    } catch (error) {

        return res.status(401).json({
            message: "Invalid Token"
        });

    }
};

// Same JWT verification as authMiddleware, but never blocks the request.
// Used on public browsing GET routes (categories, test-series, current-affairs)
// that should still work with no token — if the token is missing, invalid,
// expired, or belongs to a deactivated/deleted user, we just fall back to an
// anonymous request (req.user = null) instead of 401/403ing. Controllers on
// these routes already branch on `req.user?.role` to decide public vs admin
// visibility, so an anonymous caller is treated the same as a non-admin one.
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");

        if (!user || !user.isActive) {
            req.user = null;
            return next();
        }

        req.user = user;

        next();

    } catch (error) {

        req.user = null;
        next();

    }
};

export default authMiddleware;