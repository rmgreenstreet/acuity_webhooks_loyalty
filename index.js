if (process.env.NODE_ENV !== "production") {
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

const addLoyaltyPoints = async (payment, transactionInfo) => {
    console.log("Entering addLoyaltyPoints");
    try {
        if (!payment.customer_id) {
            transactionInfo.result = {
                status: "FAILED",
                reason: "No Customer ID"
            };

            await transactionInfo.save();

            // console.log(warnLogColors, "No customer ID attached to payment");
            return (warnLogColors, "No customer ID attached to payment");
        }

        console.log("Attempting to find customer with ID", payment.customer_id);
        const { customer } = await customersApi.retrieveCustomer(payment.customer_id);
        console.log(customer);
        if (customer.givenName) transactionInfo.given_name = customer.givenName;
        if (customer.familyName) transactionInfo.family_name = customer.familyName;

        console.log("Customer found. Attempting to find loyalty account for:", customer.givenName, customer.familyName);
        const loyaltyAccountResponse = await loyaltyApi.searchLoyaltyAccounts({
            query: {
                customerIds: [payment.customer_id]
            }
        });

        if (loyaltyAccountResponse.result.loyaltyAccounts.length === 0) {
            transactionInfo.result = {
                status: "FAILED",
                reason: "No Loyalty Account"
            };

            await transactionInfo.save();

            console.log(warnLogColors, `Loyalty account not found for payment ${payment.id}`);
            return (warnLogColors, `Loyalty account not found for payment ${payment.id}`);
        }

        const loyaltyAccount = loyaltyAccountResponse.result.loyaltyAccounts[0];
        console.log(successLogColors, "Found loyalty account:", loyaltyAccount);

        const updatedLoyaltyAccount = await loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.id, {
            accumulatePoints: {
                orderId: payment.order_id
            },
            locationId: payment.location_id,
            idempotencyKey: crypto.randomUUID()
        });

        transactionInfo.loyalty_account = {
            id: loyaltyAccount.id,
            balance: updatedLoyaltyAccount.result.loyaltyAccount.balance,
            lifetime_points: updatedLoyaltyAccount.result.loyaltyAccount.lifetimePoints,
            created_at: loyaltyAccount.createdAt,
            updated_at: updatedLoyaltyAccount.result.loyaltyAccount.updatedAt
        };

        transactionInfo.result = {
            status: "COMPLETED",
            reason: "Points Successfully Added"
        };

        await transactionInfo.save();

        // console.log(successLogColors, `Successfully added points to ${customer.given_name} ${customer.family_name} for transaction ${payment.order_id}`);
        return (successLogColors, `Successfully added points to ${customer.given_name} ${customer.family_name} for transaction ${payment.order_id}`);
    } catch (error) {
        if (error instanceof ApiError) {
            error.result.errors.forEach(e => {
                console.log(e.category, e.code, e.detail);
            });
            return (errorLogColors, "An API Error Occurred: ", error.result.errors);
        } else {
            console.log(errorLogColors, "Unexpected error occurred:", error);
        }

        transactionInfo.result = {
            status: "FAILED",
            reason: error
        };

        await transactionInfo.save();

        return (errorLogColors, "Unexpected error occurred:", error);
    }
};


const updatedPaymentRequestHandler = async (req, res, next) => {
    console.log("Received payment update notification");

    try {
        if (req.body) {
            const { payment } = req.body.data.object;
            console.log(successLogColors, "Payment detected: ", payment.id);
            let transactionInfo = new ProcessedInfo({
                payment: {
                    id: payment.id,
                    status: payment.status,
                    location_id: payment.location_id,
                    order_id: payment.order_id
                }
            });

            if (payment.status === "COMPLETED") {
                console.log("Finding the corresponding order: ", payment.order_id);
                ordersApi.retrieveOrder(payment.order_id)
                    .then(async (orderDetails) => {
                        if (!orderDetails) {
                            console.log("no order found")
                            transactionInfo.result = {
                                status: "FAILED",
                                reason: "No order found"
                            }
                            await transactionInfo.save();
                            console.log(errorLogColors, "Error finding order ", payment.order_id);
                            console.log("returning now because no order found")
                            return;
                        }

                        console.log(successLogColors, `Found order: ${orderDetails.order}`);

                        if (orderDetails.result.order.tenders[0].type === "CASH") {
                            transactionInfo.result = {
                                status: "FAILED",
                                reason: "Not From Acuity"
                            };

                            await transactionInfo.save();

                            console.log(warnLogColors, "This order was cash, not possible to be from Acuity. It will be skipped.");
                            return;
                        }

                        if (orderDetails.result.order.source.name === "Acuity Scheduling") {
                            console.log("This order came from Acuity. Attempting to add loyalty points");
                            const loyaltyAdded = await addLoyaltyPoints(payment, transactionInfo);
                            console.log(loyaltyAdded);
                            return;
                        } else {
                            transactionInfo.result = {
                                status: "FAILED",
                                reason: "Not From Acuity"
                            };

                            await transactionInfo.save();

                            console.log(warnLogColors, "The transaction is not from Acuity Scheduling. It will be skipped.");
                            return;
                        }
                    })
                    .catch(async (error) => {
                        console.log("entering retrieveOrder catch method");
                        transactionInfo.result = {
                            status: "FAILED",
                            reason: error
                        }
                        console.log("About to save transaction info: ", transactionInfo);
                        await transactionInfo.save();

                        console.log(errorLogColors, "No order found")
                        return;
                    });
            } else {
                transactionInfo.result = {
                    status: "FAILED",
                    reason: "Transaction Not Yet Completed"
                };

                await transactionInfo.save();

                console.log(warnLogColors, "The transaction has not yet been completed. It will be skipped.");
                return;
            }
        } else {
            console.log(warnLogColors, "The request does not have payment data. Try again.");
            return;
        }
    } catch (error) {
        if (error instanceof ApiError) {
            error.result.errors.forEach(e => {
                console.log(e.category, e.code, e.detail);
            });
        } else {
            console.error(errorLogColors, "Unexpected error occurred: ", error);
        }
    }
};


app.post("/payment_updated", quickResponse, asyncWrapper(updatedPaymentRequestHandler));

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.all('*', (req, res) => {
    console.log(`Request received for invalid path: ${req.path}`);
    res.status(401).send('This is not a valid endpoint');
});

app.listen(process.env.PORT, () => {
    console.log("Server listening on port ", process.env.PORT);
});
