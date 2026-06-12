import React, { createContext, useState, useContext, type ReactNode } from 'react';

export interface IndexContextData {
  fullData: Record<string, number[]>;
  lineNames: string[];
  selectedTraits: string[];
  optimalB: number[];
  sourceTool: string;
  datasetName: string;
}

interface IndexContextType {
  activeExport: IndexContextData | null;
  setActiveExport: (data: IndexContextData | null) => void;
}

const IndexContext = createContext<IndexContextType | undefined>(undefined);

export const IndexProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeExport, setActiveExport] = useState<IndexContextData | null>(null);

  return (
    <IndexContext.Provider value={{ activeExport, setActiveExport }}>
      {children}
    </IndexContext.Provider>
  );
};

export const useIndexContext = () => {
  const context = useContext(IndexContext);
  if (context === undefined) {
    throw new Error('useIndexContext must be used within an IndexProvider');
  }
  return context;
};
