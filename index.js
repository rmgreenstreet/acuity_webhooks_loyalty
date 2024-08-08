if(process.env.NODE_ENV !== "production") {
    require("dotenv").config();
};

const express = require("express");
const app = express();
const crypto = require("node:crypto");

const { Client, Environment, ApiError } = require("square");

const client = new Client({
    bearerAuthCredentials: {
      accessToken: process.env.SQUARE_ACCESS_TOKEN
    },
  environment: Environment.Production,
});

const { customersApi, loyaltyApi, ordersApi } = client;

const addLoyaltyPoints = async (order) => {
    const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
        query: {
            customerIds: [order.customerId]
        }
    });
    loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.id, {
        accumulatePoints: {
            orderId: order.id
        },
        locationId: process.env.LOCATION_ID,
        idempotencyKey: crypto.randomUUID()
    })
}

app.get("/new_order", async (req, res) => {
    if (req.body.data.object.state === "COMPLETED") {
        const orderDetails = await ordersApi.retrieveOrder(req.body.data.object.order_id);
        if (orderDetails.order.source.name && orderDetails.order.source.name == "Acuity Scheduling") {

        }
    } else {
        return;
    }
});