import React, { createContext, useContext, useCallback, useState } from 'react';

type ContainerRefreshContextType = {
  refresh: () => void;
  refreshKey: number;
};

const ContainerRefreshContext = createContext<ContainerRefreshContextType | undefined>(undefined);

export const useContainerRefresh = () => {
  const ctx = useContext(ContainerRefreshContext);
  if (!ctx) throw new Error('useContainerRefresh must be used within a ContainerRefreshProvider');
  return ctx;
};

export const ContainerRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return (
    <ContainerRefreshContext.Provider value={{ refresh, refreshKey }}>
      {children}
    </ContainerRefreshContext.Provider>
  );
};
