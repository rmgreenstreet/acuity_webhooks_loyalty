const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const IncomingSchema = new Schema({

});

module.exports = mongoose.model("Incoming", IncomingSchema);
