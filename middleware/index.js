module.exports = {
    asyncWrapper: (fn) => {
        return (req, res, next) => {
            fn(req, res, next).catch(next)
        }
    },
    quickResponse: async(req, res, next) => {
        console.log(req.body);
        const { payment } = req.body.data.object;
        if (payment.payment_id) {
            res.status(202)
            res.send("Request Received");
            next();
        } else {
            res.status(404)
            next("No payment ID specified");
        }
  }
}