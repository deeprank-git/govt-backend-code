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

export default authMiddleware;