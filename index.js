const express = require('express');
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
var jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getValue, setValue } = require("node-global-storage");

// Ports
const port = process.env.PORT || 5000;
const app = express();


// Middleware.
app.use(express.json());
app.use(cors());


// MongoDB Server Code.
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zqb2d.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// client and server url's.
const client_url = process.env.CLIENT_URL;
const server_url = process.env.SERVER_URL;

// Bkash Payment Related url's.
const grant_token_url = process.env.BKASH_GRANT_TOKEN_URL;
const create_url = process.env.BKASH_CREATE_URL;
const execute_url = process.env.BKASH_EXECUTE_URL;


// Server Code.
async function run() {
    try {
        await client.connect();
        const database = client.db('GS_Shop');
        const productsCollection = database.collection('products');
        const popularCollection = database.collection('popularProducts');
        const ordersCollection = database.collection('orders');
        const cartsCollection = database.collection('carts');
        const customersCollection = database.collection('customers');
        const categoriesCollection = database.collection('categories');
        const couponsCollection = database.collection('coupons');
        const staffsCollection = database.collection('staffs');
        const regionCollection = database.collection('region');
        const cityCollection = database.collection('city');
        const zoneCollection = database.collection('zone');




        // ----------------------------------------
        //            Token Related API
        // ----------------------------------------



        // Create JWT Token.
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            if (!user.email) {
                return res.status(400).json({ error: "Email is required" })
            };
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });


        // Check Token Middleware.
        const VerifyToken = (req, res, next) => {
            // console.log(req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ status: 401, message: 'unauthorize access' });
            }
            const token = req.headers.authorization.split(" ")[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorize access' });
                }
                req.decoded = decoded;
                next();
            })
        };


        // Check User Admin Middleware.
        // const VerifyAdmin = async (req, res, next) => {
        //     //     const email = req.decoded.email;
        //     //     const query = { email: email };
        //     //     const user = await UsersCollection.findOne(query);
        //     //     const isAdmin = user?.role === 'admin';
        //     //     if (!isAdmin) {
        //     //         return res.status(403).send({ message: 'forbidden access' });
        //     //     }
        //     //     next();
        // };



        // -------------------------------------------------------------
        //                        Products API
        // -------------------------------------------------------------



        // Get All Products API.
        app.get('/products', async (req, res) => {
            const size = parseInt(req.query.size);
            const page = parseInt(req.query.page);
            const title = req.query.title;
            const category = req.query.category;
            const price = req.query.price;

            let count;
            let products;
            if (page || size) {
                const filter = {
                    ...(title && { title: { $regex: title, $options: 'i' } }),
                    ...(category && { parent: { $regex: category, $options: 'i' } })
                }

                if (price === 'asc' || price === 'desc') {
                    const sortValue = price === "asc" ? 1 : -1;
                    products = await productsCollection.find(filter).skip(page * size).limit(size).sort({ price: sortValue }).toArray();
                    const productLimit = await productsCollection.find(filter).toArray();
                    count = productLimit.length;
                }
                else {
                    products = await productsCollection.find(filter).skip(page * size).limit(size).toArray();
                    const productLimit = await productsCollection.find(filter).toArray();
                    count = productLimit.length;
                }
            }
            else {
                products = await productsCollection.find().toArray();
                count = await productsCollection.estimatedDocumentCount();
            }

            const totalCount = await productsCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                products,
            });
        });


        // Get Specific Product.
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.send(result);
        });


        // Get Popular Product.
        app.get("/popularProducts", async (req, res) => {
            const popularProducts = await popularCollection.find().toArray();
            const count = await popularCollection.estimatedDocumentCount();
            const totalCount = await popularCollection.estimatedDocumentCount();
            res.send({
                totalCount,
                count,
                popularProducts
            });
        });


        /*---------------------------------------------------------
        //                      Categories API.
        ---------------------------------------------------------*/



        // Get All Categories API.
        app.get('/categories', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const search = req.query.search;


            let categories;
            let count;

            if (page) {
                const filter = {
                    ...(search && { parent: { $regex: search, $options: 'i' } })
                };
                categories = await categoriesCollection.find(filter).skip(page * size).limit(size).toArray();
                const categoriesLimit = await categoriesCollection.find(filter).toArray();
                count = categoriesLimit.length;
            }
            else {
                const filter = {
                    ...(search && { parent: { $regex: search, $options: 'i' } })
                };
                categories = await categoriesCollection.find(filter).toArray();
                count = categories.length;
            }

            const totalCount = await categoriesCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                categories,
            });
        });


        // Get Specific Category.
        app.get('/category/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await categoriesCollection.findOne(query);
            res.send(result);
        });




        /*--------------------------------------------------------------
        //                      Coupons API.
        --------------------------------------------------------------*/



        // Get All Coupon.
        app.get('/coupons', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const search = req.query.search;
            let coupons;

            if (page) {
                const filter = {
                    $or: [
                        { title: { $regex: search, $options: 'i' } },
                        { couponCode: { $regex: search, $options: 'i' } }
                    ]
                };
                coupons = await couponsCollection.find(filter).skip(page * size).limit(size).toArray();
                const couponsLimit = await couponsCollection.find(filter).toArray();
                count = couponsLimit.length;
            } else {
                coupons = await couponsCollection.find({}).toArray();
                count = coupons.length;
            }

            const totalCount = await couponsCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                coupons,
            });
        });


        // Get a Specific Coupon.
        app.get('/coupon/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await couponsCollection.findOne(query);
            res.send(result);
        });




        // --------------------------------------------------------
        //                      Cart API
        // -------------------------------------------------------



        // Get Cart Item
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartsCollection.findOne(query);
            if (result) {
                res.send(result);
            }
            else {
                res.send({ message: "No Data Found For This User!!" });
            }
        });


        // Post or update Item In Carts.
        app.patch('/carts', async (req, res) => {
            const { email, item } = req.body;
            const user = await cartsCollection.findOne({ email });


            if (!user) {
                const cart = [item];
                const data = {
                    email: email,
                    cart: cart,
                    cartTotalPrice: parseFloat(item.price),
                    cartDiscount: parseFloat(0),
                    cartTotalItem: cart.length,
                    cartTotalQuantity: item.quantity,
                    appliedCoupon: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const result = await cartsCollection.insertOne(data);
                res.send({ message: 'Item Added In The Cart.', result });
            }
            else {
                const existingProductIndex = user.cart.findIndex(p => p._id === item._id);

                if (existingProductIndex !== -1) {
                    user.cart[existingProductIndex].quantity += item.quantity;
                }
                else {
                    user.cart.push(item);
                }

                // Recalculate totals
                const totalItem = user.cart.length;
                const totalQuantity = user.cart.reduce((sum, p) => sum + p.quantity, 0);
                const totalPrice = user.cart.reduce((sum, p) => sum + (p.price * p.quantity), 0);

                const filter = { email: email };
                const updateDoc = {
                    $set: {
                        cart: user.cart,
                        cartTotalPrice: parseFloat(totalPrice),
                        cartDiscount: parseFloat(0),
                        cartTotalItem: totalItem,
                        cartTotalQuantity: totalQuantity,
                        appliedCoupon: null,
                        updatedAt: new Date().toISOString()
                    }
                };
                const result = await cartsCollection.updateOne(filter, updateDoc);
                res.status(200).send(result);
            }
        });


        // Update cart item quantity.
        app.patch('/carts/quantity', async (req, res) => {
            const action = req.query.quantity;
            const { email, id } = req.body;
            const user = await cartsCollection.findOne({ email });

            const existingProductIndex = user.cart.findIndex(item => item._id === id);

            if (action === "-1") {
                user.cart[existingProductIndex].quantity -= 1;
            }
            else {
                user.cart[existingProductIndex].quantity += 1;
            }

            // Recalculate totals
            const totalItem = user.cart.length;
            const totalQuantity = user.cart.reduce((sum, p) => sum + p.quantity, 0);
            const totalPrice = user.cart.reduce((sum, p) => sum + (p.price * p.quantity), 0);

            const filter = { email: email };
            const updateDoc = {
                $set: {
                    cart: user.cart,
                    cartTotalPrice: parseFloat(totalPrice),
                    cartDiscount: parseFloat(0),
                    cartTotalItem: totalItem,
                    cartTotalQuantity: totalQuantity,
                    appliedCoupon: null,
                    updatedAt: new Date().toISOString()
                }
            };
            const result = await cartsCollection.updateOne(filter, updateDoc);
            res.status(200).send(result);
        });


        // Delete Cart Item.
        app.delete('/carts', async (req, res) => {
            const email = req.query.email;
            const id = req.query.id;
            // console.log(email, id);
            const user = await cartsCollection.findOne({ email });
            const newCart = user.cart.filter(p => p._id !== id);

            const totalItem = newCart.length;
            const totalQuantity = newCart.reduce((sum, p) => sum + p.quantity, 0);
            const totalPrice = newCart.reduce((sum, p) => sum + (p.price * p.quantity), 0);
            const filter = { email: email };
            const updateDoc = {
                $set: {
                    cart: newCart,
                    cartTotalPrice: parseFloat(totalPrice),
                    cartDiscount: parseFloat(0),
                    cartTotalItem: totalItem,
                    cartTotalQuantity: totalQuantity,
                    appliedCoupon: null,
                    updatedAt: new Date().toISOString()
                }
            };
            const result = await cartsCollection.updateOne(filter, updateDoc);
            res.status(200).send(result);
        });


        // Apply Coupon Code.
        app.post('/apply-coupon', async (req, res) => {
            const { subtotal, couponCode, email } = req.body;

            // Find the coupon in our simulated database
            const foundCoupon = await couponsCollection.findOne({ couponCode: couponCode.toUpperCase() });

            // If no coupon is found with the given code
            if (!foundCoupon) {
                return res.status(400).json({ message: 'Invalid coupon code.' });
            };

            // Check if the subtotal meets the minimum purchase requirement for the found coupon
            if (subtotal < foundCoupon.minimumAmount) {
                const message = `The purchase amount is required to be a minimum of $${foundCoupon.minimumAmount.toFixed(2)} to apply/use this coupon.`;
                return res.status(400).json({ message });
            };


            // Calculate the discount amount.
            const discountAmount = (subtotal * foundCoupon.discountPercentage) / 100;

            // Update Cart Discount Amount.
            const result = await cartsCollection.updateOne({ email }, {
                $set: {
                    cartDiscount: parseFloat(discountAmount),
                    appliedCoupon: couponCode
                }
            });

            if (result.modifiedCount > 0) {
                // Send a successful response with the calculated discount and a message
                res.status(200).send(result);
            }
            else {
                // Send a Error response message.
                res.status(400).send({
                    message: `something want's wrong!! please try again.`,
                });
            }
        });




        /*---------------------------------------------------------
        //                      Orders API
        ---------------------------------------------------------*/



        // Get All Orders.
        app.get('/orders', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const email = req.query.email;
            const search = req.query.search;
            const status = req.query.status;
            const date = parseInt(req.query.date);

            const currentDate = new Date();
            currentDate.setDate(currentDate.getDate() - date);

            let orders;
            let count;

            if (page) {
                const filter = {
                    ...(search && { displayName: { $regex: search, $options: 'i' } }),
                    ...(status && { status: { $regex: status, $options: 'i' } }),
                    ...(date && { orderTime: { $gte: currentDate } }),
                    ...(email && { email: { $regex: email, $options: 'i' } })
                }
                orders = await ordersCollection.find(filter).sort({ orderTime: -1 }).skip(page * size).limit(size).toArray();
                const ordersLimit = await ordersCollection.find(filter).toArray();
                count = ordersLimit.length;
            } else {
                orders = await ordersCollection.find({}).sort({ orderTime: -1 }).toArray();
                count = await ordersCollection.estimatedDocumentCount();
            }

            const totalCount = await ordersCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                orders,
            });
        });


        // Get Customer Specified Order.
        app.get('/order/user', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const email = req.query.email;
            const query = { "customerInfo.customer_email": email };
            let orders;
            let count;
            if (page && email) {
                orders = await ordersCollection.find(query).skip(page * size).limit(size).toArray();
                count = orders.length;
            } else if (email) {
                orders = await ordersCollection.find(query).toArray();
                count = orders.length;
            } else if (page) {
                orders = await ordersCollection.find({}).skip(page * size).limit(size).toArray();
                count = orders.length;
            }

            const totalCount = await ordersCollection.estimatedDocumentCount();

            res.json({
                totalCount,
                count,
                orders: orders.reverse()
            });
        });


        // Get Order For Invoice.
        app.get('/order/invoice', async (req, res) => {
            const { email, id } = req.query;
            const query = { _id: new ObjectId(id), "customerInfo.customer_email": email };
            const result = await ordersCollection.findOne(query);
            if (result) {
                res.status(200).send(result);
            }
            else {
                res.status(404).send({ message: "No Order Found! Please Try with right credential." })
            }
        });

        // Post new Order.
        app.post('/add-order', async (req, res) => {
            const orderInfo = req.body;
            const email = orderInfo.customerInfo.customer_email;
            let orderId;
            let orderExists = true;
            let invoiceId = orderInfo.invoice;
            let invoiceExists = true;

            // Froude Checking for duplicate order.
            if (orderInfo.paymentMethod === "BKASH") {
                const existing = await ordersCollection.findOne({
                    $or: [
                        { "paymentInfo.paymentID": orderInfo.paymentInfo.paymentID },
                        { "paymentInfo.trxID": orderInfo.paymentInfo.trxID }
                    ]
                });

                if (existing) {
                    return res.status(403).send({ message: "This payment has already been used to purchase an order! Please make another payment to place a new order." })
                }
            };

            // Create an Unique Order Id.
            while (orderExists) {
                const pin = Math.floor(100000 + Math.random() * 900000);
                orderId = "order-" + pin;

                // Check database if this orderId already exists
                const order = await ordersCollection.findOne({ orderId });
                orderExists = !!order;
            };

            // Create An Unique Invoice Id.
            if (orderInfo.invoice === null) {
                while (invoiceExists) {
                    const pin = Math.floor(100000 + Math.random() * 900000);
                    invoiceId = "#" + pin;

                    // Check database if this orderId already exists
                    const invoice = await ordersCollection.findOne({ invoiceId });
                    invoiceExists = !!invoice;
                };
                orderInfo.invoice = invoiceId;
            };

            orderInfo.orderId = orderId;

            // Insert Order Data in Order Database.
            const result = await ordersCollection.insertOne(orderInfo);

            // Remove cart item from cart.
            if (result.insertedId) {
                // const user = await cartsCollection.findOne({ email });
                // const newCart = user.cart.filter(p => p._id !== id);

                // const totalItem = newCart.length;
                // const totalQuantity = newCart.reduce((sum, p) => sum + p.quantity, 0);
                // const totalPrice = newCart.reduce((sum, p) => sum + (p.price * p.quantity), 0);
                const updateDoc = {
                    $set: {
                        cart: [],
                        cartTotalPrice: 0,
                        cartDiscount: 0,
                        cartTotalItem: 0,
                        cartTotalQuantity: 0,
                        appliedCoupon: null,
                        updatedAt: new Date().toISOString()
                    }
                };
                const cartResult = await cartsCollection.updateOne({ email }, updateDoc);

                result.orderId = orderId
                result.invoice = invoiceId

                res.status(200).send(result);
            }
            else {
                res.status(400).send({ message: "somethings want's wrong! please try again." });
            }
        });


        // Update Order Status.
        // app.patch('/update/order-status/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const currentStatus = req.body;

        //     const filter = { _id: new ObjectId(id) };
        //     const updateDoc = {
        //         $set: {
        //             status: currentStatus.status
        //         }
        //     };

        //     const result = await ordersCollection.updateOne(filter, updateDoc);
        //     res.send(result);
        // });


        // 
        // app.patch('/up-orders', async (req, res) => {
        //     const result = await ordersCollection.updateMany({}, { $rename: { "shipping&billing": "sbAddress" } });

        //     if (result.deletedCount === 0) {
        //         return res.status(404).json({ message: 'No orders found with the "orderTime" field.' });
        //     }

        // res.status(200).json({
        //     message: `${result.deletedCount} orders with 'orderTime' field deleted successfully.`,
        //     deletedCount: result.deletedCount,
        // });
        // });


        /*---------------------------------------------------------
        //                  Customers/User API
        ---------------------------------------------------------*/



        // Get All Customers.
        app.get('/customers', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const search = req.query.search;

            let customers;
            let count;
            if (page) {
                const filter = {
                    $or: [
                        { displayName: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                        { phoneNumber: { $regex: search, $options: 'i' } }
                    ]
                };
                customers = await customersCollection.find(filter).skip(page * size).limit(size).toArray();
                const customersLimit = await customersCollection.find(filter).toArray();
                count = customersLimit.length;
            }
            else {
                const filter = {
                    $or: [
                        { displayName: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                        { phoneNumber: { $regex: search, $options: 'i' } }
                    ]
                };
                customers = await customersCollection.find(filter).toArray();
                count = customers.length;
            }

            const totalCount = await customersCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                customers,
            });
        });


        // Get Specific Customers.
        app.get('/customer', async (req, res) => {
            const { email } = req.query;
            const result = await customersCollection.findOne({ email });
            res.send(result);
        });


        // Post New Customer Info.
        app.post('/customers/add', async (req, res) => {
            let uid;
            let exists = true;
            const userData = req.body;
            const email = { email: userData.email };
            const existingUser = await customersCollection.findOne(email);

            if (existingUser) {
                return res.status(409).send({ message: "User Already Exist!!" });
            }
            else {
                while (exists) {
                    const pin = Math.floor(100000 + Math.random() * 900000);
                    uid = "GSHOP-" + pin;

                    // Check database if this uid already exists
                    const user = await customersCollection.findOne({ uid });
                    exists = !!user;
                };
                userData.uid = uid
                const result = await customersCollection.insertOne(userData)
                res.status(200).send(result);
            }
        });


        // Update Customer Profile.
        app.put('/customer/update/profile', async (req, res) => {
            const { email } = req.query;
            const updatedData = req.body;
            // console.log(email, updatedData);
            updateDoc = {
                $set: {
                    displayName: updatedData.displayName,
                    phoneNumber: updatedData.phoneNumber,
                    dob: updatedData.dob,
                    gender: updatedData.gender,
                    updatedAt: new Date().toISOString()
                }
            };
            const result = await customersCollection.updateOne({ email }, updateDoc);
            res.send(result);
        });


        // Add Customer Addresses.
        app.put('/customer/add/address', async (req, res) => {
            const email = req.query.user;
            const newAddress = req.body;
            newAddress._id = new ObjectId();

            const result = await customersCollection.updateOne({ email }, { $push: { addresses: newAddress } });
            res.send(result);
        });


        // Update Customer Addresses.
        app.put('/customer/update/address', async (req, res) => {
            const email = req.query.user;
            const id = req.query.addressId;
            const newAddress = req.body;
            const query = { email: email, "addresses._id": new ObjectId(id) };
            const updateDoc = {
                $set: {
                    "addresses.$.fullName": newAddress.fullName,
                    "addresses.$.phoneNumber": newAddress.phoneNumber,
                    "addresses.$.address": newAddress.address,
                    "addresses.$.region": newAddress.region,
                    "addresses.$.city": newAddress.city,
                    "addresses.$.zone": newAddress.zone
                }
            };

            const result = await customersCollection.updateOne(query, updateDoc);
            res.send(result);
        });


        // Delete customers.
        app.delete('/customer/delete/address', async (req, res) => {
            const email = req.query.user;
            const id = req.query.addressId;

            const result = await customersCollection.updateOne(
                { email },
                { $pull: { addresses: { _id: new ObjectId(id) } } }
            );
            res.send(result);
        });


        // Delete customers.
        app.delete('/customer/delete/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id)
            const query = { _id: new ObjectId(id) };
            const result = await customersCollection.deleteOne(query);
            res.send(result);
        });



        // ----------------------------------------------------------------------------
        //                          Location API
        // ----------------------------------------------------------------------------


        app.get("/api/region", async (req, res) => {
            const result = await regionCollection.find().toArray();
            res.send(result);
        });


        app.get("/api/city", async (req, res) => {
            const id = req.query.addressId
            const query = { parentId: id };
            const result = await cityCollection.find(query).toArray();
            res.send(result);
        });


        app.get("/api/zone", async (req, res) => {
            const id = req.query.addressId
            const query = { parentId: id };
            const result = await zoneCollection.find(query).toArray();
            res.send(result);
        });



        // ----------------------------------------------------------------------------
        //                         Payment Related API
        // ----------------------------------------------------------------------------

        // Card Payment Api.
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });



        // -------------------------------------------------------
        //                  Bkash Payment Api. 
        // -------------------------------------------------------


        // Create Grand Token.
        app.post("/create_payment", async (req, res) => {
            const { price } = req.body;
            let invoiceId;
            let invoiceExists = true;

            // Create An Unique Invoice Id.
            while (invoiceExists) {
                const pin = Math.floor(100000 + Math.random() * 900000);
                invoiceId = "#" + pin;

                // Check database if this orderId already exists
                const invoice = await ordersCollection.findOne({ invoiceId });
                invoiceExists = !!invoice;
            };
            setValue("invoiceId", invoiceId);
            // console.log("New Id: ", getValue("invoiceId"));

            // Fetch Grand Token.
            const options = {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    username: process.env.BKASH_USERNAME,
                    password: process.env.BKASH_PASSWORD,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    app_secret: process.env.BKASH_APP_SECRET,
                    app_key: process.env.BKASH_APP_KEY
                })
            };

            fetch(`${grant_token_url}`, options)
                .then(response => response.json())
                .then(data => {
                    // Set Token In The Global Storage.
                    setValue("id_token", data.id_token, { protected: true });

                    // Fetch Create Payment.
                    if (data.id_token) {
                        // Payment Create Options.
                        const create_options = {
                            method: 'POST',
                            headers: {
                                accept: 'application/json',
                                Authorization: `Bearer ${getValue("id_token")}`,
                                'X-APP-Key': process.env.BKASH_APP_KEY,
                                'content-type': 'application/json'
                            },
                            body: JSON.stringify({
                                mode: '0011',
                                payerReference: ' ',
                                callbackURL: `${server_url}/execute_payment`,
                                amount: parseFloat(price).toFixed(2),
                                currency: 'BDT',
                                intent: 'sale',
                                merchantInvoiceNumber: invoiceId
                            })
                        };

                        fetch(`${create_url}`, create_options)
                            .then(response => response.json())
                            .then(data => {
                                res.send(data);
                            })
                            .catch(err => {
                                res.send(err);
                            });
                    }
                })
                .catch(err => {
                    res.send(err);
                })
        });


        // Execute Payment.
        app.get("/execute_payment", async (req, res) => {
            const { paymentID, status } = req.query;

            // Set Payment ID In The Global Storage.
            setValue("paymentID", paymentID, { protected: true });

            // Check If Payment Cancel Or Fail.
            if (status === "cancel" || status === "failure") {
                // return res.redirect(`http://localhost:5173/error?paymentID=${paymentID}&status=${status}`);
                return res.redirect(`${client_url}/user/payment?paymentID=${paymentID}&status=${status}`);
            };

            // Execute Payment If Payment Status Success.
            if (status === "success") {
                try {
                    const options = {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            Authorization: `Bearer ${getValue("id_token")}`,
                            'X-APP-Key': process.env.BKASH_APP_KEY,
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({ paymentID: paymentID })
                    };

                    fetch(`${execute_url}`, options)
                        .then(response => response.json())
                        .then(data => {
                            if (data.statusCode === "0000" && data.statusMessage === "Successful") {
                                const invoice = getValue("invoiceId");
                                return res.redirect(`${client_url}/user/payment?paymentID=${paymentID}&status=${status}&trxID=${data.trxID}&transactionStatus=${data.transactionStatus}&invoiceId=${invoice.slice(1, 7)}`);
                            }
                        })
                        .catch(err => {
                            res.send(err);
                        });
                }
                catch (error) {
                    res.send(error);
                }
            }
        });



    }
    finally {
        // await client.close();
    }
};
run().catch(console.dir);



// Default Get.
app.get('/', (req, res) => {
    res.send('Running G-Shop Server');
});


// Listening Port.
app.listen(port, () => {
    console.log('server running on port:', port);
});