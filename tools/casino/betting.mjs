export function betBounds(legal,bb){return {min:Math.min(legal.minRaise,legal.maxRaise),max:legal.maxRaise,step:Math.max(.5,bb/2)};}
export function snapBet(value,bounds){const {min,max,step}=bounds;if(value<=min)return min;if(value>=max)return max;return Math.max(min,Math.min(max,Math.round(value/step)*step));}
export function sliderToBet(t,bounds){const {min,max}=bounds;return snapBet(min+(max-min)*(Math.max(0,Math.min(1000,Number(t)))/1000)**2,bounds);}
export function betToSlider(value,bounds){return bounds.max===bounds.min?0:Math.round(1000*Math.sqrt(Math.max(0,Math.min(1,(value-bounds.min)/(bounds.max-bounds.min)))));}
export function exactBetValid(value,bounds){return String(value).trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=bounds.min&&Number(value)<=bounds.max&&Number(value)*2%1===0;}
export function presetBet(kind,legal,bb,pot,alreadyBet){const bounds=betBounds(legal,bb);if(kind==='min')return bounds.min;if(kind==='all')return bounds.max;const fraction=kind==='half'?.5:1;return snapBet(alreadyBet+legal.call+(pot+legal.call)*fraction,bounds);}
