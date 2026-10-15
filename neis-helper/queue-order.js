export const verified=(progress,item)=>progress[item.queueId]?.saved===true&&(progress[item.queueId]?.autoVerified===true||progress[item.queueId]?.manualConfirmed===true);
export function queueOrder(rows,progress){return rows.map((item,index)=>({item,index})).sort((a,b)=>Number(verified(progress,a.item))-Number(verified(progress,b.item)));}
export function retryProgress(rows,progress){const next={...progress};for(const item of rows)if(!verified(progress,item))next[item.queueId]={...next[item.queueId],saved:false,autoVerified:false,skipError:undefined};return next;}
