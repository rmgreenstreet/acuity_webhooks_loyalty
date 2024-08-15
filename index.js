if(process.env.NODE_ENV !== "production") {
    require("dotenv").config();
};

const express = require("express");
const app = express();
const crypto = require("node:crypto");
const { Client, Environment, ApiError } = require("square");

// Set up Square API client
const client = new Client({
  bearerAuthCredentials: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN
  },
environment: Environment.Production,
});

const { loyaltyApi, ordersApi, customersApi } = client;

const { asyncWrapper, quickResponse } = require("./middleware");
const { connectToMongoose, ExpressError } = require("./utils");
const ProcessedInfo = require("./models/processedInfo");

const successLogColors = "\x1b[32m"
const warnLogColors = "\x1b[33m"
const errorLogColors = "\x1b[31m"

//Connect to Mongoose with an initial 5 second delay before next attempt, if failed
connectToMongoose(5000);

app.use(express.json())

const addLoyaltyPoints = async (payment, transactionInfo,) => {
    console.log("entering addLoyaltyPoints")
    return new Promise(async (resolve, reject) => {
        try {
            if (!payment.customer_id) {
              transactionInfo.result = {
                status: "FAILED",
                reason: "No Customer ID"
              }
              await transactionInfo.save().then(() => {
                resolve(console.log(warnLogColors, "No customer Id attached to payment"))
              })
            }
            console.log("Attempting to find customer with ID ", payment.customer_id);
            const { customer } = await customersApi.retrieveCustomer(payment.customer_id);
            if (customer.given_name) {transactionInfo.given_name = customer.given_name}
            if (customer.family_name) {transactionInfo.family_name = customer.family_name}
            console.log("Customer found and Recorded. Attempting to find loyalty account for: ", customer.given_name, customer.family_name);
            const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
                query: {
                    customerIds: [payment.customer_id]
                }
            });
            if (Object.keys(loyaltyAccount.result).length === 0) {
              
              transactionInfo.result = {
                status: "FAILED",
                reason: "No Loyalty Account"
              }
              await transactionInfo.save().then(() => {
                resolve(console.log(warnLogColors, `Loyalty account not found for payment ${payment.id}`));
              })
            }
            console.log(successLogColors, "Found loyalty account: ", loyaltyAccount);
            let updatedLoyaltyAccount = await loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.result.loyaltyAccounts.id, {
                accumulatePoints: {
                    orderId: payment.order_id
                },
                locationId: payment.location_id,
                idempotencyKey: crypto.randomUUID()
            }).then(async () => {
              transactionInfo.loyalty_account = {
                id: loyaltyAccount.id,
                balance: updatedLoyaltyAccount.balance,
                lifetime_points: updatedLoyaltyAccount.lifetime_points,
                created_at: loyaltyAccount.created_at,
                updated_at: updatedLoyaltyAccount.updated_at
              }
              transactionInfo.result = {
                status: "COMPLETED",
                reason: "Points Successfully Added"
              }
              await transactionInfo.save().then(()=> {
                resolve(`Successfully added points to ${customer.given_name} ${customer.family_name} for transaction ${order.id}`)
              })
            })

            
        } catch (error) {if (error instanceof ApiError) {
            error.result.errors.forEach(function (e) {
              console.log(e.category);
              console.log(e.code);
              console.log(e.detail);
            });
          } else {
            console.log(errorLogColors, "Unexpected error occurred: ", error);
          }
          transactionInfo.result = {
            status: "FAILED",
            reason: error.message
          }
          await transactionInfo.save().then(() => {
            reject(error);
          })
        }
    })
}

const updatedPaymentRequestHandler = async (req, res, next) => {
    console.log("Received payment update notification")
    return new Promise(async (resolve, reject) => {
        try {
            if (req.body) {
                const { payment } = req.body.data.object;
                let transactionInfo = new ProcessedInfo({
                  payment: {
                    id: payment.id,
                    status: payment.status,
                    location_id: payment.location_id,
                    order_id: payment.order_id
                  }
                });
                console.log(successLogColors, "Payment detected: ", payment);
                if (payment.status === "COMPLETED") {
                    console.log("Finding the corresponding order")
                    const orderDetails = await ordersApi.retrieveOrder(payment.order_id);
                    console.log(successLogColors, `Found order: ${orderDetails}`)
                    if (orderDetails.result.order.tenders[0].type === "CASH") {
                      transactionInfo.result = {
                        status: "FAILED",
                        reason: "Not From Acuity"
                      }
                      transactionInfo.save().then(
                        resolve(console.log(warnLogColors, "This order was cash, not possible to be acuity, it will be skipped"))
                      )
                    }
                    if (orderDetails.result.order.source.name && 
                        orderDetails.result.order.source.name == "Acuity Scheduling") {
                            console.log("This order came from Acuity. Attempting to add loyalty points");
                            await addLoyaltyPoints(payment, transactionInfo).then(() => {
                                resolve(console.log(successLogColors, "Loyalty points successfully added"))
                            })
                    } else {
                      transactionInfo.result = {
                        status: "FAILED",
                        reason: "Not From Acuity"
                      }
                      await transactionInfo.save().then(() => {
                        resolve(console.log(warnLogColors, "The transaction is not from Acuity Scheduling, it will be skipped"))
                      })
                    }
                } else {
                  transactionInfo.result = {
                    status: "FAILED",
                    reason: "Transaction Not Yet Completed"
                  }
                  await transactionInfo.save().then(() => {
                    resolve(console.log(warnLogColors, "The transaction has not yet been completed, it will be skipped"))
                  })
                }
            }  else {
              transactionInfo.result = {
                status: "FAILED",
                reason: "Transaction Not Yet Completed"
              }
              await transactionInfo.save().then(() => {
                resolve(console.log(warnLogColors, "The request does not have payment data. Try again"))
              })
                
            }
        } catch(error) {
            if (error instanceof ApiError) {
                error.result.errors.forEach(function (e) {
                  console.log(e.category);
                  console.log(e.code);
                  console.log(e.detail);
                });
                reject(console.error(errorLogColors, "There was a problem with the API service"))
              } else {
                console.error(errorLogColors, "Unexpected error occurred: ", error);
                reject(error);
              }
        }
    });
    return;
}

app.post("/payment_updated", quickResponse, asyncWrapper(updatedPaymentRequestHandler));

app.all("*", (req, res) => {
  console.log("* endpoint catcher reached");
  res.send("This is not a valid endpoint");
});

app.listen(process.env.PORT, () => {
    console.log("Server listening on port ", process.env.PORT);
});
