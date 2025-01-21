import React, { useState, useEffect, useCallback } from 'react';
import FamilyTree from './FamilyTree';

const App = () => {
  const [familyData, setFamilyData] = useState(null);

  // Fetch initial data from the Flask backend
  const fetchTreeData = useCallback(() => {
    fetch("/tree")
      .then(response => response.json())
      .then(data => setFamilyData(data))
      .catch(error => console.error("Error fetching family data:", error));
  }, []);

  useEffect(() => {
    fetchTreeData();
  }, [fetchTreeData]);

  const updateTreeData = useCallback((newData) => {
    setFamilyData(newData);
    fetch("/update-tree", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newData),
    })
    .then(response => response.json())
    .then(data => console.log("Tree data updated successfully:", data))
    .catch(error => console.error("Error updating tree data:", error));
  }, []);

  const resetTree = useCallback(() => {
    fetchTreeData();
  }, [fetchTreeData]);

  if (!familyData) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh',
      background: 'linear-gradient(135deg, #F0F7FF 0%, #FFF5F5 100%)', // Soft blue to pink gradient
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    }}>
      <FamilyTree 
        data={familyData} 
        updateTreeData={updateTreeData}
        resetTree={resetTree}
      />
    </div>
  );
};

export default App;