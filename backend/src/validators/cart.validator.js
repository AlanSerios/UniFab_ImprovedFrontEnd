import { body, param } from "express-validator";

const addCartItemValidator = () => {
  return [
    body("quoteToken")
      .trim()
      .notEmpty()
      .withMessage("Quote token is required")
      .bail()
      .isLength({ min: 64, max: 64 })
      .withMessage("Quote token is invalid")
      .bail()
      .isHexadecimal()
      .withMessage("Quote token is invalid"),

    body().custom((_, { req }) => {
      const allowedFields = new Set(["quoteToken"]);

      for (const field of Object.keys(req.body)) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for cart items`);
        }
      }

      return true;
    }),
  ];
};

const cartItemIdValidator = () => {
  return [
    param("cartItemId")
      .isInt({ min: 1 })
      .withMessage("Cart item ID must be a positive integer"),
  ];
};

export { addCartItemValidator, cartItemIdValidator };
