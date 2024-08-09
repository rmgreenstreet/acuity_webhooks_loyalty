if(process.env.NODE_ENV !== "production") {
    require("dotenv").config();
};

const express = require("express");
const app = express();
const crypto = require("node:crypto");

const PORT = 3000;

const asyncWrapper = require("./utils/asyncWrapper")

const { Client, Environment, ApiError } = require("square");

const client = new Client({
    bearerAuthCredentials: {
      accessToken: process.env.SQUARE_SANDBOX_ACCESS_TOKEN
    },
  environment: Environment.Sandbox,
});

const { paymentsApi, loyaltyApi, ordersApi } = client;

app.use(express.json())

const addLoyaltyPoints = async (payment) => {
    console.log("entering addLoyaltyPoints")
    return new Promise(async (resolve, reject) => {
        try {
            const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
                query: {
                    customerIds: [payment.customer_id]
                }
            });
            console.log(loyaltyAccount);
            reject("Testing");
            if (Object.keys(loyaltyAccount.result).length === 0) {
                throw new Error(`Loyalty account not found for payment ${payment.id}`)
            }
            await loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.result.loyaltyAccounts.id, {
                accumulatePoints: {
                    orderId: payment.order_id
                },
                locationId: payment.location_id,
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
            if (req.body.payment) {
                const { payment } = req.body;
                console.log(payment);
                if (payment.status === "COMPLETED") {
                    const orderDetails = await ordersApi.retrieveOrder(payment.order_id);
                    if (orderDetails.result.order.tenders[0].type === "CASH") {
                        throw new Error("This order was cash, not possible to be acuity")
                    }
                    if (orderDetails.result.order.source.name && 
                        orderDetails.result.order.source.name == "Acuity Scheduling") {
                            await addLoyaltyPoints(payment).then(() => {
                                resolve(res.send("Loyalty points successfully added"))
                            })
                    } else {
                        throw new Error("The transaction is not from Acuity Scheduling")
                    }
                } else {
                    throw new Error("The transaction has not yet been completed")
                }
            }  else {
                throw new Error("The request does not have data")
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
                reject(error);
              }
        }
    });
}

app.post("/payment_updated", asyncWrapper(newOrderRequestHandler));

app.all("*", (req, res) => {
    res.send("This is not a valid endpoint");
});

app.listen(PORT, () => {
    console.log("Server listening on port ", PORT);
});