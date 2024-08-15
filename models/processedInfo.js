const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PaymentObjectSchema = new Schema({
    id: { 
        type: String,
        required: true
    },
    status: {
        enum: ["COMPLETED", "CANCELED", "CREATED"]
    },
    location_id: {
        type: String,
        required: true
    },
    order_id: {
        type: String,
        required: true
    }
});

const LoyaltyAccountSchema = new Schema({
    id: String,
    balance: Number,
    lifetime_points: Number,
    customer_id: String,
    created_at: String,
    updated_at: {
        type: Date,
        default: Date.now()
    }
});

const ProcessedInfoSchema = new Schema({
    received: {
        type: Date,
        default: Date.now()
    },
    payment: PaymentObjectSchema,
    given_name: String,
    family_name: String,
    loyalty_account: {
        type: LoyaltyAccountSchema
    },
    result: {
        status: {
            type: String,
            enum: ["COMPLETED", "FAILED"]
        },
        reason: String
    }
})

module.exports = mongoose.model("ProcessedInfo", ProcessedInfoSchema);
