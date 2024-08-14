const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const IncomingSchema = new Schema({
    payment_id: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model("Incoming", IncomingSchema);