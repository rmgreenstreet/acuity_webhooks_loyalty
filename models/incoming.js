const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const IncomingSchema = new Schema({
    payment_id: {
        type: String,
        required: true
    },
    received: {
        type: Date,
        required: true,
        default: Date.now()
    }
});

module.exports = mongoose.model("Incoming", IncomingSchema);