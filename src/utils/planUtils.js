// src/utils/planUtils.js

export const checkIsPlanEmpty = (data) => {
  if (data.pair || data.narrative || data.planText?.trim() || data.conclusionsText?.trim() || data.actualNarrative || data.analysisMistakeText?.trim() || data.sessionRating > 0) return false;
  
  const allBlocks = [...(data.tdaBlocks || []), ...(data.updates || []), ...(data.reviewBlocks || [])];
  const hasBlockData = allBlocks.some(b => b.tf?.trim() || b.image || b.text?.trim());
  
  return !hasBlockData;
};

export const formatDateToTraderStyle = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};