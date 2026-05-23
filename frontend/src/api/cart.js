import { apiRequest } from "./client";

export function getMyCart() {
  return apiRequest("/cart");
}

export function addQuoteToCart(quoteToken) {
  return apiRequest("/cart/items", {
    method: "POST",
    body: JSON.stringify({ quoteToken }),
  });
}

export function removeCartItem(cartItemId) {
  return apiRequest(`/cart/items/${cartItemId}`, {
    method: "DELETE",
  });
}

export function clearMyCart() {
  return apiRequest("/cart", {
    method: "DELETE",
  });
}
