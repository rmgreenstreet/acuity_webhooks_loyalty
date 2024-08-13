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

const { loyaltyApi, ordersApi } = client;

const { asyncWrapper, quickResponse } = require("./middleware");
const { connectToMongoose, ExpressError } = require("./utils");
const ProcessedInfo = require("./models/processedInfo");

const successLogColors = "\x1b[32m"
const warnLogColors = "\x1b[33m"
const errorLogColors = "\x1b[31m"

//Connect to Mongoose with an initial 5 second delay before next attempt, if failed
// connectToMongoose(5000);

app.use(express.json())

const addLoyaltyPoints = async (payment, res) => {
    console.log("entering addLoyaltyPoints")
    return new Promise(async (resolve, reject) => {
        try {
            if (!payment.customer_id) {
                resolve(console.log(warnLogColors, "No customer Id attached to payment"))
            }
            console.log("attempting to find loyalty account for: ", payment.customer_id);
            const loyaltyAccount = await loyaltyApi.searchLoyaltyAccounts({
                query: {
                    customerIds: [payment.customer_id]
                }
            });
            if (Object.keys(loyaltyAccount.result).length === 0) {
                resolve(console.log(warnLogColors, `Loyalty account not found for payment ${payment.id}`));
            }
            if (typeof loyaltyAccount.result.loyaltyAccounts.id == undefined) {
                resolve(console.log(warnLogColors, `Loyalty account not found for payment ${payment.id}`));
            }
            console.log(successLogColors, "Found loyalty account: ", loyaltyAccount);
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
            console.log(errorLogColors, "Unexpected error occurred: ", error);
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
                console.log(successLogColors, "Payment detected: ", payment);
                if (payment.status === "COMPLETED") {
                    console.log("Finding the corresponding order")
                    const orderDetails = await ordersApi.retrieveOrder(payment.order_id);
                    console.log(successLogColors, `Found order: ${orderDetails}`)
                    if (orderDetails.result.order.tenders[0].type === "CASH") {
                        resolve(console.log(warnLogColors, "This order was cash, not possible to be acuity, it will be skipped"))
                    }
                    if (orderDetails.result.order.source.name && 
                        orderDetails.result.order.source.name == "Acuity Scheduling") {
                            console.log("This order came from Acuity. Attempting to add loyalty points");
                            await addLoyaltyPoints(payment, res).then(() => {
                                resolve(console.log(successLogColors, "Loyalty points successfully added"))
                            })
                    } else {
                        resolve(console.log(warnLogColors, "The transaction is not from Acuity Scheduling, it will be skipped"));
                    }
                } else {
                    resolve(console.log(warnLogColors, "The transaction has not yet been completed, it will be skipped"));
                }
            }  else {
                resolve(console.log(warnLogColors, "The request does not have payment data. Try again"))
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
}

app.post("/payment_updated", quickResponse, asyncWrapper(updatedPaymentRequestHandler));

app.all("*", (req, res) => {
  console.log(req);
  res.send("This is not a valid endpoint");
});

app.listen(process.env.PORT, () => {
    console.log("Server listening on port ", process.env.PORT);
});


const payment = 

{
    amount_money: { amount: 8748, currency: 'USD' },
    application_details: {
      application_id: 'sq0idp-nbWhEGaLnDZMLNI1dVakNw',
      square_product: 'ECOMMERCE_API'
    },
    approved_money: { amount: 8748, currency: 'USD' },
    card_details: {
      auth_result_code: '901925',
      avs_status: 'AVS_ACCEPTED',
      card: {
        bin: '442521',
        card_brand: 'VISA',
        card_type: 'DEBIT',
        exp_month: 7,
        exp_year: 2029,
        fingerprint: 'sq-1-4tNQMXqPV3zn3WTjTjqdNQgcooT07mZ5Yar-0gfFjxTKO8nh7w3VGdc68rqHlRdfcw',
        last_4: '0601',
        prepaid_type: 'NOT_PREPAID'
      },
      card_payment_timeline: {
        authorized_at: '2024-08-10T13:57:05.677Z',
        captured_at: '2024-08-10T13:57:05.981Z'
      },
      cvv_status: 'CVV_NOT_CHECKED',
      entry_method: 'KEYED',
      statement_description: 'SQ *TOPEKA CAT CAFE',
      status: 'CAPTURED'
    },
    created_at: '2024-08-10T13:57:05.097Z',
    delay_action: 'CANCEL',
    delay_duration: 'PT168H',
    delayed_until: '2024-08-17T13:57:05.097Z',
    id: 'L5WyGeDEA6HCeHP8GtPuyRl7NPQZY',
    location_id: 'LGAKPKKGR240K',
    note: '1311547236 - Bethany Weber - 50 Min. Kitten Room Visit - August 10, 2024 1:00pm | 1311547237 - Bethany Weber - 50 Min. Kitten Room Visit - August 10, 2024 1:00pm | 1311547238 - Bethany Weber - 50 Min. Kitten Room Visit - August 10, 2024 1:00pm | 1311547239 - Bethany Weber - 50 Min. Kitten Room Visit - August 10, 2024 1:00pm',
    order_id: '3kpF3eCJjfs44TzgYEmRsfQKXpWZY',
    processing_fee: [
      {
        amount_money: [Object],
        effective_at: '2024-08-10T15:57:07.000Z',
        type: 'INITIAL'
      }
    ],
    receipt_number: 'L5Wy',
    receipt_url: 'https://squareup.com/receipt/preview/L5WyGeDEA6HCeHP8GtPuyRl7NPQZY',
    risk_evaluation: { created_at: '2024-08-10T13:57:05.885Z', risk_level: 'NORMAL' },
    source_type: 'CARD',
    status: 'COMPLETED',
    total_money: { amount: 8748, currency: 'USD' },
    updated_at: '2024-08-10T13:57:09.394Z',
    version: 5
  }