


const { campgroundSchema } = require("./schemas.js");

module.exports = (req, res, next) => {
    const { error } = campgroundSchema.validate(req.body);
    if (error) {
        const msg = error.details.map(el => el.message).join(",");
        throw new ExpressError(msg, 400)
    } else {
        return next();
    }
};