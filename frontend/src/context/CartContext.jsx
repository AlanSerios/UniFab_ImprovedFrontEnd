/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  addQuoteToCart,
  clearMyCart,
  getMyCart,
  removeCartItem,
} from "../api/cart";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

function normalizeCart(payload) {
  const cart = payload?.data?.cart || payload?.cart || payload || {};
  const items = Array.isArray(cart.items) ? cart.items : [];

  return {
    items,
    itemCount: Number(cart.itemCount ?? items.length),
    subtotal: Number(
      cart.estimatedTotal ??
        items.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0),
    ),
    currency: cart.currency || items[0]?.currency || "PHP",
  };
}

export function CartProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [cart, setCart] = useState({
    items: [],
    itemCount: 0,
    subtotal: 0,
    currency: "PHP",
  });
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");

  const canUseServerCart = isAuthenticated && Boolean(user?.isEmailVerified);

  const reloadCart = useCallback(async () => {
    if (!canUseServerCart) {
      setCart({ items: [], itemCount: 0, subtotal: 0, currency: "PHP" });
      setCartError("");
      return null;
    }

    try {
      setIsCartLoading(true);
      setCartError("");
      const data = await getMyCart();
      const nextCart = normalizeCart(data);
      setCart(nextCart);
      return nextCart;
    } catch (err) {
      setCart({ items: [], itemCount: 0, subtotal: 0, currency: "PHP" });
      setCartError(err.message || "Unable to load cart.");
      return null;
    } finally {
      setIsCartLoading(false);
    }
  }, [canUseServerCart]);

  useEffect(() => {
    let isMounted = true;

    Promise.resolve().then(() => {
      if (isMounted) {
        reloadCart();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [reloadCart]);

  const value = useMemo(() => {
    async function addItem(quoteToken) {
      const data = await addQuoteToCart(quoteToken);
      const nextCart = normalizeCart(data);
      const addedItem = data?.data?.cartItem || data?.cartItem || null;
      setCart(nextCart);
      return {
        ...nextCart,
        addedItem,
      };
    }

    async function removeItem(cartItemId) {
      const data = await removeCartItem(cartItemId);
      const nextCart = normalizeCart(data);
      setCart(nextCart);
      return nextCart;
    }

    async function clearCart() {
      if (!canUseServerCart) {
        setCart({ items: [], itemCount: 0, subtotal: 0, currency: "PHP" });
        return null;
      }

      const data = await clearMyCart();
      const nextCart = normalizeCart(data);
      setCart(nextCart);
      return nextCart;
    }

    return {
      ...cart,
      isCartLoading,
      cartError,
      addItem,
      removeItem,
      clearCart,
      reloadCart,
    };
  }, [canUseServerCart, cart, cartError, isCartLoading, reloadCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
