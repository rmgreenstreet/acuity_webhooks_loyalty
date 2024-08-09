if(process.env.NODE_ENV !== "production") {
    require("dotenv").config();
};

const express = require("express");
const app = express();
const crypto = require("node:crypto");

const asyncWrapper = require("./utils/asyncWrapper");
const ExpressError = require("./utils/ExpressError");

const { Client, Environment, ApiError } = require("square");

const client = new Client({
    bearerAuthCredentials: {
      accessToken: process.env.SQUARE_ACCESS_TOKEN
    },
  environment: Environment.Production,
});

const { loyaltyApi, ordersApi } = client;

app.use(express.json())


// TODO Find out how to send back an "ok" status code when breaking out of the try blocks


const addLoyaltyPoints = async (payment) => {
    console.log("entering addLoyaltyPoints")
    return new Promise(async (resolve, reject) => {
        try {
            const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
                query: {
                    customerIds: [payment.customer_id]
                }
            });
            if (Object.keys(loyaltyAccount.result).length === 0) {
                throw new Error(`Loyalty account not found for payment ${payment.id}`)
            }
            console.log("Found loyalty account: ", loyaltyAccount);
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

const updatedPaymentRequestHandler = async (req, res, next) => {
    console.log("Received payment update notification")
    return new Promise(async (resolve, reject) => {
        try {
            if (req.body) {
                const { payment } = req.body.data.object;
                console.log("Payment detected: ", payment);
                if (payment.status === "COMPLETED") {
                    console.log("Finding the corresponding order")
                    const orderDetails = await ordersApi.retrieveOrder(payment.order_id);
                    console.log("Found order: ", orderDetails.id)
                    if (orderDetails.result.order.tenders[0].type === "CASH") {
                        throw new ExpressError("This order was cash, not possible to be acuity, it will be skipped", 200)
                    }
                    if (orderDetails.result.order.source.name && 
                        orderDetails.result.order.source.name == "Acuity Scheduling") {
                            console.log("This order came from Acuity. Attempting to add loyalty points");
                            await addLoyaltyPoints(payment).then(() => {
                                resolve(console.log("Loyalty points successfully added"), res.send("Loyalty points successfully added"))
                            })
                    } else {
                        resolve(res.status(204), console.log("The transaction is not from Acuity Scheduling, it will be skipped"));
                    }
                } else {
                    resolve(res.status(204), console.log("The transaction has not yet been completed, it will be skipped"));
                }
            }  else {
                resolve(res.status(400), console.log("The request does not have payment data. Try again"))
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

app.post("/payment_updated", asyncWrapper(updatedPaymentRequestHandler));

app.all("*", (req, res) => {
    res.send("This is not a valid endpoint");
});

app.listen(process.env.PORT, () => {
    console.log("Server listening on port ", process.env.PORT);
});