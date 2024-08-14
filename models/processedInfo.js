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
    payment: PaymentObjectSchema,
    loyalty_account: {
        type: LoyaltyAccountSchema
    },
    customer_firstName: String,
    customer_lastName: String,
    result: {
        status: {
            enum: ["COMPLETED", "FAILED"]
        },
        reason: {
            enum: ["Not From Acuity", "No Loyalty Account", "Transaction Not Yet Completed", "No Customer ID"]
        }
    }
})

module.exports = mongoose.model("ProcessedInfo", ProcessedInfoSchema);
