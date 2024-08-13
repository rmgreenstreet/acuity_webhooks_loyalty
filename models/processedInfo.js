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
    id: {
        type: String,
        required: true
    },
    balance: Number,
    lifetime_points: Number,
    customer_id: {
        type: String,
        required: true
    },
    created_at: {
        type: String,
        required: true
    },
    updated_at: {
        type: Date,
        required: true,
        default: Date.now()
    }
});

const ProcessedInfoSchema = new Schema({
    customer_firstName: String,
    customer_lastName: String,
    loyalty_account: {
        type: LoyaltyAccountSchema
    },
    payment: PaymentObjectSchema,
    result: {
        status: {
            enum: ["COMPLETED", "FAILED"]
        },
        reason: {
            enum: ["Not From Acuity", "No Loyalty Account", "Transaction Not Yet Completed"]
        }
    }
})

module.exports = mongoose.model("ProcessedInfo", ProcessedInfoSchema);
