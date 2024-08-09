if(process.env.NODE_ENV !== "production") {
    require("dotenv").config();
};

const express = require("express");
const app = express();
const crypto = require("node:crypto");

const PORT = 3000;

const { Client, Environment, ApiError } = require("square");

const client = new Client({
    bearerAuthCredentials: {
      accessToken: process.env.SQUARE_ACCESS_TOKEN
    },
  environment: Environment.Production,
});

const { customersApi, loyaltyApi, ordersApi } = client;

const addLoyaltyPoints = async (order) => {
    return new Promise(async (resolve, reject) => {
        try {
            const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
                query: {
                    customerIds: [order.customerId]
                }
            });
            // TODO: check whether a loyalty account is returned before continuing, and break out if not. use promises
            await loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.id, {
                accumulatePoints: {
                    orderId: order.id
                },
                locationId: process.env.LOCATION_ID,
                idempotencyKey: crypto.randomUUID()
            });
            resolve(`Successfully added points to loyalty account ${loyaltyAccount.id} for transaction ${order.id}`)
        } catch (error) {if (error instanceof ApiError) {
            error.result.errors.forEach(function (e) {
              console.log(e.category);
              console.log(e.code);
              console.log(e.detail);
            });
          } else {
            console.log("Unexpected error occurred: ", error);
          }
          reject(error);
        }
    })
    
}

const newOrderRequestHandler = async (req, res, next) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (req.body.data.object.state === "COMPLETED") {
                if (orderDetails.order.source.name && 
                    orderDetails.order.source.name == "Acuity Scheduling") {
                        const orderDetails = await ordersApi.retrieveOrder(req.body.data.object.order_id);
                        await addLoyaltyPoints(orderDetails);
                        resolve(res.send("Loyalty points successfully added"))
                } else {
                    throw new Error("The transaction is not from Acuity Scheduling")
                }
            }  
        } catch(error) {
            if (error instanceof ApiError) {
                error.result.errors.forEach(function (e) {
                  console.log(e.category);
                  console.log(e.code);
                  console.log(e.detail);
                });
                reject("There was a problem with the API service")
              } else {
                console.log("Unexpected error occurred: ", error);
                reject(res.send(error));
              }
        }
    });
}

app.get("/new_order", newOrderRequestHandler);

app.get("*", (req, res) => {
    res.send("This is not a valid endpoint");
});

app.listen(PORT, () => {
    console.log("Server listening on port ", PORT);
});