export function rangeText(value,{scale=1,digits=0,unknown='未知'}={}){
 if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite))return unknown;
 const a=(value[0]/scale).toFixed(digits),b=(value[1]/scale).toFixed(digits);
 return a===b?a:`${a}～${b}`;
}
