const mongoose = require("mongoose");
const Schema = mongoose.Schema;


const IncomingSchema = new Schema({
    merchant_id: {
        type: String,
        required: true
    },
    payment: {
        type: PaymentObjectSchema,
        required: true
    }
});

module.exports = mongoose.model("Incoming", IncomingSchema);
module.exports = mongoose.model("Payment", PaymentObjectSchema);
