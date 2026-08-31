export type Rating='again'|'hard'|'good';

export interface Deck{ id:string;name:string;description?:string;source:string;cardCount?:number;order?:number; }
export interface Card{ id:string;legacyKey?:string;deckId:string;front:string;back:string;note?:string;tags:string[];order:number;source:string; }
export interface ReviewState{ cardId:string;intervalDays:number;dueDay:number;lapses:number;reviewCount:number;lastReviewAt?:number; }
export interface ReviewLog{ id?:number;cardId:string;deckId:string;reviewedAt:number;rating:Rating;previousIntervalDays:number;nextIntervalDays:number;dueDay:number; }
export interface MetaEntry{ key:string;value:string|number|boolean; }

export const DAY_MS=86_400_000;
export const dayNumber=(now=Date.now())=>Math.floor(now/DAY_MS);

export const freshState=(cardId:string,today=dayNumber()):ReviewState=>({
  cardId,intervalDays:0,dueDay:today,lapses:0,reviewCount:0
});

export function schedule(previous:ReviewState|undefined,cardId:string,rating:Rating,now=Date.now()):ReviewState{
  const today=dayNumber(now);
  const old=previous??freshState(cardId,today);
  const first=old.reviewCount===0;
  let intervalDays=old.intervalDays;
  let lapses=old.lapses;
  if(rating==='again'){ intervalDays=0;lapses+=1; }
  else if(first){ intervalDays=rating==='good'?3:1;if(rating==='good')lapses=0; }
  else{
    intervalDays=rating==='good'
      ?Math.max(2,Math.ceil(Math.max(1,old.intervalDays)*2.5))
      :Math.max(1,Math.ceil(Math.max(1,old.intervalDays)*1.6));
    if(rating==='good')lapses=0;
  }
  return{cardId,intervalDays,dueDay:today+intervalDays,lapses,reviewCount:old.reviewCount+1,lastReviewAt:now};
}

export function buildTodayQueue(cards:Card[],stateMap:Map<string,ReviewState>,today:number,wrongCap=10,freshCap=20):string[]{
  const wrong:Array<{id:string;due:number;lapses:number}>=[],review:string[]=[],fresh:string[]=[];
  for(const card of cards){
    const state=stateMap.get(card.id);
    if(!state){fresh.push(card.id);continue;}
    if(state.dueDay>today)continue;
    if(state.lapses>0)wrong.push({id:card.id,due:state.dueDay,lapses:state.lapses});
    else review.push(card.id);
  }
  wrong.sort((a,b)=>a.due-b.due||b.lapses-a.lapses);
  return[...wrong.slice(0,wrongCap).map(x=>x.id),...review,...fresh.slice(0,freshCap)];
}
