import Cart from "../models/CartModel.js";
import asyncHandler from "express-async-handler";
import axios from "axios";
import dotenv from "dotenv";

////////////////////////////////////////////////////// removeuser cart fuction and add 6-122 lines modify .env

// Load the max cart product from environment variables
const MAX_CART = process.env.MAX_CART || 100;

const userCart = asyncHandler(async (req, res) => {
  const { cart } = req.body;
  const { _id } = req.user;
  let total = 0;
  let tax = 0;

  try {
    let products = [];

    // Check whether the product already exists in the user's cart
    const alreadyExistCart = await Cart.findOne({ orderby: _id });

    // Validate the cart data before processing
    if (Array.isArray(cart) && cart.length > 0 && cart.length <= MAX_CART) {
      // Limit max cart length to 100
      if (alreadyExistCart) {
        products = alreadyExistCart.products;

        for (let i = 0; i < cart.length; i++) {
          let existingProductIndex = products.findIndex(
            (p) => p.product.toString() === cart[i]._id
          );
          if (existingProductIndex !== -1) {
            // Add count to the existing product in the cart
            products[existingProductIndex].count += cart[i].count;
          } else {
            // Add a new product to the cart
            let object = {};
            object._id = cart[i]._id;
            object.product = cart[i]._id;
            object.count = cart[i].count;

            // Validate the product ID before making an API call
            if (cart[i]._id) {
              try {
                // Fetch the price of the product via API
                let getPrice = await axios.get(
                  `http://product:7005/api/product/${cart[i]._id}`,
                  {
                    headers: {
                      Authorization: `Bearer ${
                        req.headers.authorization.split(" ")[1]
                      }`,
                    },
                  }
                );
                object.price = getPrice.data.price;
                products.push(object);
              } catch (error) {
                // Handle error from the API call
                console.error("Error fetching product price:", error);
              }
            } else {
              // Log an error if the product ID is invalid
              console.error("Invalid product ID in cart.");
            }
          }
        }

        alreadyExistCart.products = products;
        total = calculateCartTotal(products);
        tax = total * 0.03;
        alreadyExistCart.cartTotal = total + tax;
        alreadyExistCart.tax = tax;
        const updatedCart = await alreadyExistCart.save();
        res.json(updatedCart);
      } else {
        for (let i = 0; i < cart.length; i++) {
          let object = {};
          object._id = cart[i]._id;
          object.product = cart[i]._id;
          object.count = cart[i].count;

          // Fetch the price of the product
          let getPrice = await axios.get(
            `http://product:7005/api/product/${cart[i]._id}`,
            {
              headers: {
                Authorization: `Bearer ${
                  req.headers.authorization.split(" ")[1]
                }`,
              },
            }
          );
          object.price = getPrice.data.price;
          products.push(object);
        }

        let cartTotal = calculateCartTotal(products);
        let tax = cartTotal * 0.03;
        cartTotal += tax;

        let newCart = await new Cart({
          products,
          cartTotal,
          tax,
          orderby: _id,
        }).save();
        res.json(newCart);
      }
    } else {
      // Log an error if the cart data is invalid (not an array, empty, or exceeds the limit)
      console.error(
        "Invalid cart data. Please check the cart structure or length."
      );
      res.status(400).json({ message: "Invalid cart data" });
    }
  } catch (error) {
    throw new Error(error);
  }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////

//empty cart
const emptyCart = asyncHandler(async (req, res) => {
  const { _id } = req.user;
  try {
    const cart = await Cart.findOneAndRemove({ orderby: _id });
    res.json(cart);
  } catch (error) {
    throw new Error(error);
  }
});

//apply coupons
const applyCoupon = asyncHandler(async (req, res) => {
  const { coupon } = req.body;
  const { _id } = req.user;
  try {
    const response = await axios.get("http://coupon:7003/api/Coupon/", {
      headers: {
        Authorization: `Bearer ${req.headers.authorization.split(" ")[1]}`,
      },
    });
    const resCoupon = response.data;

    // check whether the coupon is Valid
    const validCoupon = resCoupon.find(
      (c) => c.name.toLowerCase() === coupon.toLowerCase()
    );

    if (!validCoupon) {
      return res.status(400).json({ message: "Invalid coupon code" });
    }
    if (validCoupon === null) {
      throw new Error("Invalid coupon");
    }
    let { cartTotal } = await Cart.findOne({ orderby: _id });

    let totalAfterDiscount = (
      cartTotal -
      (cartTotal * validCoupon.discount) / 100
    ).toFixed(2);
    await Cart.findOneAndUpdate(
      { orderby: _id },
      { totalAfterDiscount },
      { new: true }
    );

    res.json(totalAfterDiscount);
  } catch (error) {
    console.log(error);
  }
});

//calculate cart total
const calculateCartTotal = (products) => {
  let cartTotal = 0;
  for (let i = 0; i < products.length; i++) {
    cartTotal += products[i].price * products[i].count;
  }
  return cartTotal;
};

//remove from cart
const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { _id } = req.user;

  try {
    const updatedCart = await Cart.findOneAndUpdate(
      { orderby: _id },
      { $pull: { products: { product: productId } } },
      { new: true }
    );

    // update the cart total
    const newCartTotal = calculateCartTotal(updatedCart.products);
    updatedCart.cartTotal = newCartTotal;
    await updatedCart.save();

    res.json({ message: "Product removed from cart", updatedCart });
  } catch (error) {
    throw new Error(error);
  }
});

//get cart
const getUserCart = asyncHandler(async (req, res) => {
  const { _id } = req.user;
  try {
    const updatedCart = await Cart.updateOne(
      { orderby: _id },
      { $pull: { products: null } }
    );
    if (updatedCart.nModified === 0) {
      return res.status(404).json({ message: "Cart not found" });
    }
    const cart = await Cart.findOne({ orderby: _id });

    // populate products in the cart
    const populatedCart = await Promise.all(
      cart.products.map(async (product) => {
        const _id = product.product;
        const response = await axios.get(
          `http://product:7005/api/product/${_id}`
        );
        const data = response.data;
        return { ...product.toObject(), product: data };
      })
    );
    res.json({ ...cart.toObject(), products: populatedCart });
  } catch (error) {
    throw new Error(error);
  }
});

export default {
  userCart,
  removeFromCart,
  getUserCart,
  emptyCart,
  calculateCartTotal,
  applyCoupon,
};
