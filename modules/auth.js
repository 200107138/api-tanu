const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

module.exports = async function (request, result, next) {
    try {
        const accessToken = request.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(accessToken, global.jwtSecret);
        const userId = decoded.userId;
 
        console.log("Decoded userId:", userId);

        const user = await global.db.collection("users").findOne({
            _id: new ObjectId(userId) // Correctly instantiate ObjectId with the new keyword
        });
 
        console.log("User found:", user);

        if (!user) {
            result.json({
                status: "error",
                message: "User not found."
            });
            return;
        }

        const userObj = {
            _id: new ObjectId(userId),
            email: user.email
        };
        request.user = userObj;
        next();
    } catch (exp) {
        console.error("Error in auth middleware:", exp);
        result.json({
            status: "error",
            message: "User has been logged out."
        });
    }
};
