(function(root){
 'use strict';
 function number(value,fallback=0){const result=Number(value??fallback);if(!Number.isFinite(result))throw Error('领地收支包含无效数值');return result;}
 function round(value){const amount=number(value),scaled=Math.abs(amount)*100,rounded=Math.round(scaled+Number.EPSILON*Math.max(1,scaled))/100;return (amount<0?-rounded:rounded)||0;}
 function sharePercent(value=100){const percent=number(value,100);if(percent<0||percent>100||Math.abs(percent*100-Math.round(percent*100))>1e-8)throw Error('玩家净收益分成必须为0至100，最多两位小数');return percent;}
 function calculate(stats,incomes=[],expenses=[],employees=[],percent=100){
  const income=number(stats.population)*number(stats.tax_rate,1.2)+number(stats.subsidy)+incomes.reduce((sum,item)=>sum+number(item.count,1)*number(item.unit_price??item.amount),0);
  const expense=expenses.reduce((sum,item)=>sum+number(item.count)*number(item.unit_cost),0)+employees.reduce((sum,item)=>sum+(number(item.salary)===-1?0:number(item.salary)),0);
  const net=round(income-expense),share=sharePercent(percent);
  return {total_income:round(income),total_expense:round(expense),net_income:net,profit_share_percent:share,player_net_income:round(net*share/100)};
 }
 root.TerritoryFinance=Object.freeze({calculate,sharePercent,round});
})(globalThis);
