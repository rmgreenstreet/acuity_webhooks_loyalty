const Incoming = require("../models/incoming");

module.exports = {
    asyncWrapper: (fn) => {
        return (req, res, next) => {
            fn(req, res, next).catch(next)
        }
    },
    quickResponse: async(req, res, next) => {
        const { payment } = req.body.data.object;
        if (payment.id) {
            res.status(202)
            res.send("Request Received");
            await new Incoming({payment_id: payment.id}).save();
            next();
        } else {
            res.status(404)
            next("No payment ID specified");
        }
  }
}