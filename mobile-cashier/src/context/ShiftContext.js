import React, { createContext, useContext, useState, useCallback } from 'react';
import { shiftsAPI } from '../services/api';

const ShiftContext = createContext(null);

export function ShiftProvider({ children }) {
  const [shift, setShift] = useState(null);
  const [loadingShift, setLoadingShift] = useState(false);

  const checkOpenShift = useCallback(async (branch_id, user_id) => {
    setLoadingShift(true);
    try {
      const shifts = await shiftsAPI.current(branch_id);
      const mine = (shifts || []).find(s => s.user_id === user_id);
      setShift(mine || null);
      return mine || null;
    } catch {
      setShift(null);
      return null;
    } finally {
      setLoadingShift(false);
    }
  }, []);

  const openShift = async ({ branch_id, shift_type, opening_cash, notes }) => {
    const s = await shiftsAPI.open({ branch_id, shift_type, opening_cash, notes });
    setShift(s);
    return s;
  };

  const closeShift = async (id, actual_cash, notes) => {
    const result = await shiftsAPI.close(id, { actual_cash, notes });
    setShift(null);
    return result;
  };

  const refreshShift = async (branch_id, user_id) => {
    const shifts = await shiftsAPI.current(branch_id);
    const mine = (shifts || []).find(s => s.user_id === user_id);
    setShift(mine || null);
    return mine || null;
  };

  return (
    <ShiftContext.Provider value={{ shift, loadingShift, checkOpenShift, openShift, closeShift, refreshShift, setShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export const useShift = () => useContext(ShiftContext);
