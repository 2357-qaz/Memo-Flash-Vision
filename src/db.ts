import Dexie,{type Table}from'dexie';
import type{Card,Deck,MetaEntry,ReviewLog,ReviewState}from'./core';

class MemoDB extends Dexie{
  decks!:Table<Deck,string>;
  cards!:Table<Card,string>;
  states!:Table<ReviewState,string>;
  logs!:Table<ReviewLog,number>;
  meta!:Table<MetaEntry,string>;
  constructor(){
    super('memo-flashcards');
    this.version(1).stores({
      decks:'id,name,source,order',
      cards:'id,deckId,source,order,*tags',
      states:'cardId,dueDay,lapses,lastReviewAt',
      logs:'++id,cardId,deckId,reviewedAt,rating',
      meta:'key'
    });
  }
}
export const db=new MemoDB();
