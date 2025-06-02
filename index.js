const express = require('express');
const cors = require('cors');
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
var jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
        const VerifyAdmin = async (req, res, next) => {
            //     const email = req.decoded.email;
            //     const query = { email: email };
            //     const user = await UsersCollection.findOne(query);
            //     const isAdmin = user?.role === 'admin';
            //     if (!isAdmin) {
            //         return res.status(403).send({ message: 'forbidden access' });
            //     }
            //     next();
        };




        // -----------------------------------------------------------
        //                      Dashboard Stats
        // -----------------------------------------------------------




        app.get("/dashboard/order-stats", async (req, res) => {

            // Get today's start and end time
            const todayStart = moment().startOf("day").toDate();
            const todayEnd = moment().endOf("day").toDate();

            // Get yesterday's start and end time
            const yesterdayStart = moment().subtract(1, "days").startOf("day").toDate();
            const yesterdayEnd = moment().subtract(1, "days").endOf("day").toDate();

            // Get first day and last day of current month
            const monthStart = moment().startOf("month").toDate();
            const monthEnd = moment().endOf("month").toDate();

            // Get last month's start and end time
            const lastMonthStart = moment().subtract(1, "months").startOf("month").toDate();
            const lastMonthEnd = moment().subtract(1, "months").endOf("month").toDate();

            // Aggregate for today's revenue
            const todayRevenue = await ordersCollection.aggregate([
                { $match: { orderTime: { $gte: todayStart, $lte: todayEnd } } },
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();

            // Aggregate for yesterday's revenue
            const yesterdayRevenue = await ordersCollection.aggregate([
                { $match: { orderTime: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();

            // Aggregate for method's revenue
            const methodRevenue = await ordersCollection.aggregate([
                { $group: { _id: "$paymentMethod.type", totalAmount: { $sum: "$grandTotal" } } },
                {
                    $project: {
                        _id: 0,
                        name: "$_id",
                        totalAmount: "$totalAmount"
                    }
                }
            ]).toArray();

            // Aggregate for this month's revenue
            const thisMonthRevenue = await ordersCollection.aggregate([
                { $match: { orderTime: { $gte: monthStart, $lte: monthEnd } } },
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();

            // Aggregate for last month's revenue
            const lastMonthRevenue = await ordersCollection.aggregate([
                { $match: { orderTime: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();

            // Aggregate for all-time revenue
            const allTimeRevenue = await ordersCollection.aggregate([
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();


            // Get Total and status wise orders.
            const totalOrders = (await ordersCollection.find().toArray()).length;

            // 
            const statusCounts = await ordersCollection.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } },
                {
                    $project: {
                        _id: 0,
                        status: "$_id",
                        count: "$count"
                    }
                }
            ]).toArray();

            res.send({
                todayRevenue: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
                yesterdayRevenue: yesterdayRevenue.length > 0 ? yesterdayRevenue[0].total : 0,
                methodRevenue,
                thisMonthRevenue: thisMonthRevenue.length > 0 ? thisMonthRevenue[0].total : 0,
                lastMonthRevenue: lastMonthRevenue.length > 0 ? lastMonthRevenue[0].total : 0,
                allTimeRevenue: allTimeRevenue.length > 0 ? allTimeRevenue[0].total : 0,
                totalOrders,
                statusCounts
            });
        });





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

        // Add/Post New Products.
        app.post('/add-new/product', async (req, res) => {
            const product = req.body;

            const price = parseInt(product.price);
            const originalPrice = parseInt(product.originalPrice);
            const quantity = parseInt(product.quantity);
            product.price = price;
            product.originalPrice = originalPrice;
            product.quantity = quantity;
            product.discount = (originalPrice - price) / originalPrice * 100;

            product.status = "Show";
            product.createdAt = new Date().toISOString();
            product.updatedAt = new Date().toISOString();
            const result = await productsCollection.insertOne(product);
            res.send(result);
        });


        // Update Product.
        app.patch('/update/product/:id', async (req, res) => {
            const id = req.params.id;
            const product = req.body;
            const price = parseInt(product.price);
            const originalPrice = parseInt(product.originalPrice);
            const quantity = parseInt(product.quantity);
            product.price = price;
            product.originalPrice = originalPrice;
            product.quantity = quantity;
            product.discount = (originalPrice - price) / originalPrice * 100;
            product.updatedAt = new Date().toISOString();
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    price: product.price,
                    discount: product.discount,
                    tag: product.tag,
                    flashSale: product.flashSale,
                    children: product.children,
                    description: product.description,
                    image: product.image,
                    thumb: product.thumb,
                    originalPrice: product.originalPrice,
                    parent: product.parent,
                    quantity: product.quantity,
                    slug: product.slug,
                    title: product.title,
                    type: product.type,
                    unit: product.unit,
                    updatedAt: product.updatedAt,
                    sku: product.sku
                }
            };
            const result = await productsCollection.updateOne(filter, updateDoc);
            res.json(result);
        });


        // Update Product Status.
        app.patch('/update/product-status/:id', async (req, res) => {
            const id = req.params.id;
            const currentStatus = req.body;
            if (currentStatus.status === "Show") {
                currentStatus.status = "Hide";
            } else {
                currentStatus.status = "Show";
            }
            const updatedAt = new Date().toISOString();

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: currentStatus.status,
                    updatedAt: updatedAt
                }
            };

            const result = await productsCollection.updateOne(filter, updateDoc);
            res.json(result);
        });


        // Delete Product.
        app.delete('/product/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.send(result);
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


        // Post New Categories API.
        app.post('/add-new/category', async (req, res) => {
            const category = req.body;
            // console.log(category);
            const result = await categoriesCollection.insertOne(category);
            res.send(result);
        });


        // Update Category.
        app.patch('/update/category/:id', async (req, res) => {
            const id = req.params.id;
            const category = req.body;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    children: category.children,
                    status: category.status,
                    parent: category.parent,
                    type: category.type,
                    icon: category.icon,
                    thumb: category.thumb ? category.thumb : null
                }
            };

            const result = await categoriesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Update Category Status.
        app.patch('/update/category-status/:id', async (req, res) => {
            const id = req.params.id;
            const currentStatus = req.body;
            if (currentStatus.status === "Show") {
                currentStatus.status = "Hide";
            } else {
                currentStatus.status = "Show";
            }

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: currentStatus.status
                }
            };

            const result = await categoriesCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Delete Category.
        app.delete('/category/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await categoriesCollection.deleteOne(query);
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



        // Post New Coupon.
        app.post('/add-new/coupon', async (req, res) => {
            const coupon = req.body;
            const result = await couponsCollection.insertOne(coupon);
            res.send(result);
        });


        // Update Coupons.
        app.patch('/update/coupon/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    logo: data.logo,
                    thumb: data.thumb,
                    title: data.title,
                    minimumAmount: data.minimumAmount,
                    discountPercentage: data.discountPercentage,
                    productType: data.productType,
                    couponCode: data.couponCode,
                    endTime: data.endTime,
                    updatedAt: new Date().toISOString()
                }
            };

            const result = await couponsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Delete coupons.
        app.delete('/coupon/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await couponsCollection.deleteOne(query);
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
                    cartTotalPrice: item.price,
                    cartDiscount: 0,
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
                        cartTotalPrice: totalPrice,
                        cartDiscount: 0,
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
                    cartTotalPrice: totalPrice,
                    cartDiscount: 0,
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
                    cartTotalPrice: totalPrice,
                    cartDiscount: 0,
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


        // Get Single Order.
        app.get('/order/user', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const email = req.query.email;
            const query = { email: email };
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
                orders,
            });
        });


        // Get Order For Invoice.
        app.get('/order/invoice/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await ordersCollection.findOne(query);
            res.status(200).send(result);
        });

        // Post new Order.
        app.post('/add-order', async (req, res) => {
            const orderInfo = req.body;
            const email = orderInfo.customerInfo.customer_email;
            let orderId;
            let orderExists = true;
            let invoiceId;
            let invoiceExists = true;

            // Create an Unique Order Id.
            while (orderExists) {
                const pin = Math.floor(100000 + Math.random() * 900000);
                orderId = "order-" + pin;

                // Check database if this orderId already exists
                const order = await ordersCollection.findOne({ orderId });
                orderExists = !!order;
            };

            // Create An Unique Invoice Id.
            while (invoiceExists) {
                const pin = Math.floor(100000 + Math.random() * 900000);
                invoiceId = "#" + pin;

                // Check database if this orderId already exists
                const invoice = await ordersCollection.findOne({ invoiceId });
                invoiceExists = !!invoice;
            };

            orderInfo.orderId = orderId;
            orderInfo.invoice = invoiceId;

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
        app.patch('/update/order-status/:id', async (req, res) => {
            const id = req.params.id;
            const currentStatus = req.body;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: currentStatus.status
                }
            };

            const result = await ordersCollection.updateOne(filter, updateDoc);
            res.send(result);
        });




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


        /*---------------------------------------------------------------
        //                          Staffs API.
        ---------------------------------------------------------------*/


        // Get All Staffs.
        app.get('/staffs', async (req, res) => {
            const page = req.query.page;
            const size = parseInt(req.query.size);
            const email = req.query.email;
            const search = req.query.search;
            const role = req.query.role;

            let staffs;
            let count;
            if (page) {
                const filter = {
                    ...(search && {
                        $or: [
                            { displayName: { $regex: search, $options: 'i' } },
                            { email: { $regex: search, $options: 'i' } },
                            { contact: { $regex: search, $options: 'i' } }
                        ]
                    }),
                    ...(email && { email: { $regex: email, $options: 'i' } }),
                    ...(role && { role: { $regex: role, $options: 'i' } })
                };
                staffs = await staffsCollection.find(filter).skip(page * size).limit(size).toArray();
                const staffsLimit = await staffsCollection.find(filter).toArray();
                count = staffsLimit.length;
            }
            else {
                const filter = {
                    ...(search && {
                        $or: [
                            { displayName: { $regex: search, $options: 'i' } },
                            { email: { $regex: search, $options: 'i' } },
                            { contact: { $regex: search, $options: 'i' } }
                        ]
                    }),
                    ...(email && { email: { $regex: email, $options: 'i' } }),
                    ...(role && { role: { $regex: role, $options: 'i' } })
                };
                staffs = await staffsCollection.find(filter).toArray();
                count = staffs.length;
            }

            const totalCount = await staffsCollection.estimatedDocumentCount();

            res.send({
                totalCount,
                count,
                staffs,
            });
        });


        // Get a Specific Staff.
        app.get('/staff', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await staffsCollection.findOne(query);
            res.send(result);
        });


        // Check Staff Role.
        app.get('/staff/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            let isAdmin = false;
            const staff = await staffsCollection.findOne(query);
            if (staff?.role === "Admin") {
                isAdmin = true;
            };
            res.json({ admin: isAdmin });
        });


        // Post New Staffs.
        app.post('/add-new/staff', async (req, res) => {
            const staff = req.body;
            const hashedPass = await argon2.hash(staff.password);
            staff.password = hashedPass;
            const result = await staffsCollection.insertOne(staff);
            res.send(result);
        });


        // Update Staff Profile Information.
        app.patch('/update/staff/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const hashedPass = await argon2.hash(data.password);
            data.password = hashedPass;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    photoURL: data.photoURL,
                    thumb: data.thumb,
                    displayName: data.displayName,
                    email: data.email,
                    contact: data.contact,
                    password: data.password,
                    joiningDate: data.joiningDate,
                    role: data.role,
                    updatedAt: data.updatedAt
                }
            };

            const result = await staffsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        // Delete Staff Information.
        app.delete("/staff/delete/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await staffsCollection.deleteOne(query);
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