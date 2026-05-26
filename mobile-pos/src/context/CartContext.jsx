import React, { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [customerNote, setCustomerNote] = useState('');

  const addItem = useCallback((product, qty = 1, overridePrice = null) => {
    setItems(prev => {
      const existIdx = prev.findIndex(i => i.product_id === product.id);
      if (existIdx >= 0) {
        const updated = [...prev];
        updated[existIdx] = {
          ...updated[existIdx],
          quantity: parseFloat((parseFloat(updated[existIdx].quantity) + qty).toFixed(3)),
        };
        return updated;
      }
      const price = overridePrice !== null ? overridePrice : parseFloat(product.sell_price || 0);
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        unit: product.unit,
        is_weight: product.is_weight,
        product_type: product.product_type,
        cost_price: parseFloat(product.cost_price || 0),
        unit_price: price,
        quantity: qty,
      }];
    });
  }, []);

  const updateQty = useCallback((product_id, qty) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.product_id !== product_id));
    } else {
      setItems(prev => prev.map(i => i.product_id === product_id ? { ...i, quantity: qty } : i));
    }
  }, []);

  const updatePrice = useCallback((product_id, price) => {
    setItems(prev => prev.map(i => i.product_id === product_id ? { ...i, unit_price: price } : i));
  }, []);

  const removeItem = useCallback((product_id) => {
    setItems(prev => prev.filter(i => i.product_id !== product_id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscount(0);
    setCustomerNote('');
  }, []);

  const loadCart = useCallback((cartItems, cartDiscount = 0) => {
    setItems(cartItems);
    setDiscount(cartDiscount);
  }, []);

  const subtotal = items.reduce((s, i) => s + parseFloat(i.unit_price) * parseFloat(i.quantity), 0);
  const total = Math.max(0, subtotal - parseFloat(discount || 0));

  return (
    <CartContext.Provider value={{
      items, discount, setDiscount, customerNote, setCustomerNote,
      addItem, updateQty, updatePrice, removeItem, clearCart, loadCart,
      subtotal, total,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
