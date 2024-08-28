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
            console.warn("No customer ID attached to payment");
            return;
        }

        console.log("Attempting to find customer with ID", payment.customer_id);
        const customerResponse = await customersApi.retrieveCustomer(payment.customer_id);
        console.log("customerResponse:", customerResponse.result)
        const customer = customerResponse.result.customer;
        // console.log(customer)

        if (customer && customer.givenName) transactionInfo.given_name = customer.givenName;
        if (customer && customer.familyName) transactionInfo.family_name = customer.familyName;

        // console.log("Customer found. Attempting to find loyalty account for:", customer.givenName, customer.familyName);
        console.log("Attempting to find loyalty account for customer ID", payment.customer_id);
        const loyaltyAccountResponse = await loyaltyApi.searchLoyaltyAccounts({
            query: {
                customerIds: [payment.customer_id]
            }
        });

        console.log("loyaltyAccountResponse:", loyaltyAccountResponse.result)

        if (!loyaltyAccountResponse.result.loyaltyAccounts || loyaltyAccountResponse.result.loyaltyAccounts.length === 0) {
            transactionInfo.result = {
                status: "FAILED",
                reason: "No Loyalty Account"
            };
            await transactionInfo.save();
            console.warn(`Loyalty account not found for payment ${payment.id}`);
            return;
        }

        const loyaltyAccount = loyaltyAccountResponse.result.loyaltyAccounts[0];
        console.log("Found loyalty account:", loyaltyAccount);

        const updatedLoyaltyAccountResponse = await loyaltyApi.accumulateLoyaltyPoints(loyaltyAccount.id, {
            accumulatePoints: {
                orderId: payment.order_id
            },
            locationId: payment.location_id,
            idempotencyKey: crypto.randomUUID()
        });

        const updatedLoyaltyAccount = updatedLoyaltyAccountResponse.result.loyaltyAccount;

        transactionInfo.loyalty_account = {
            id: loyaltyAccount.id,
            balance: updatedLoyaltyAccount.balance,
            lifetime_points: updatedLoyaltyAccount.lifetimePoints,
            created_at: loyaltyAccount.createdAt,
            updated_at: updatedLoyaltyAccount.updatedAt
        };

        transactionInfo.result = {
            status: "COMPLETED",
            reason: "Points Successfully Added"
        };

        await transactionInfo.save();
        console.log(`Successfully added points to ${customer.givenName} ${customer.familyName} for transaction ${payment.order_id}`);
        return;

    } catch (error) {
        console.error("Error in addLoyaltyPoints:", error);

        if (error instanceof ApiError) {
            error.result.errors.forEach(e => {
                console.error(e.category, e.code, e.detail);
            });
        }

        transactionInfo.result = {
            status: "FAILED",
            reason: error
        };

        await transactionInfo.save();
        return;
    }
};

const updatedPaymentRequestHandler = async (req, res, next) => {
    console.log("Received payment update notification");

    try {
        if (!req.body || !req.body.data || !req.body.data.object) {
            console.warn("The request does not have payment data. Try again.");
            return;
        }

        const { payment } = req.body.data.object;
        console.log("Payment detected: ", payment.id);

        let transactionInfo = new ProcessedInfo({
            payment: {
                id: payment.id,
                status: payment.status,
                location_id: payment.location_id,
                order_id: payment.order_id
            }
        });

        if (payment.status !== "COMPLETED") {
            transactionInfo.result = {
                status: "FAILED",
                reason: "Transaction Not Yet Completed"
            };
            await transactionInfo.save();
            console.warn("The transaction has not yet been completed. It will be skipped.");
            return;
        }

        console.log("Finding the corresponding order: ", payment.order_id);
        try {
            const orderDetails = await ordersApi.retrieveOrder(payment.order_id);

            if (!orderDetails || !orderDetails.result.order) {
                transactionInfo.result = {
                    status: "FAILED",
                    reason: "No order found"
                };
                await transactionInfo.save();
                console.error("No order found ", payment.order_id);
                return;
            }

            console.log("Found order:", orderDetails.result.order);

            if (orderDetails.result.order.tenders[0].type === "CASH") {
                transactionInfo.result = {
                    status: "FAILED",
                    reason: "Not From Acuity"
                };
                await transactionInfo.save();
                console.warn("This order was cash, not possible to be from Acuity. It will be skipped.");
                return;
            }

            if (orderDetails.result.order.source.name === "Acuity Scheduling") {
                console.log("This order came from Acuity. Attempting to add loyalty points");
                await addLoyaltyPoints(payment, transactionInfo);
                console.log(successLogColors, "Loyalty points processed");
                return;
            } else {
                transactionInfo.result = {
                    status: "FAILED",
                    reason: "Not From Acuity"
                };
                await transactionInfo.save();
                console.warn("The transaction is not from Acuity Scheduling. It will be skipped.");
                return;
            }
        } catch (error) {
            transactionInfo.result = {
                status: "FAILED",
                reason: error.message
            };
            await transactionInfo.save();
            console.error("Error retrieving order:", error);
            return;
        }
    } catch (error) {
        console.error("Unexpected error in payment request handler:", error);
        return;
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
