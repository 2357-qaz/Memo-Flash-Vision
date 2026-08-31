import{db}from'./db';
import architecture from'./data/architecture.json';
import cet6 from'./data/cet6.json';
import type{Card,Deck}from'./core';

const SEED_VERSION=1;
export async function seedBundledContent(){
  const current=await db.meta.get('seedVersion');
  if(current?.value===SEED_VERSION)return;
  const decks=[...(architecture.decks as Deck[]),...(cet6.decks as Deck[])];
  const cards=[...(architecture.cards as Card[]),...(cet6.cards as Card[])];
  await db.transaction('rw',db.decks,db.cards,db.meta,async()=>{
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(cards);
    await db.meta.put({key:'seedVersion',value:SEED_VERSION});
  });
}
