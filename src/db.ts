import Dexie,{type Table}from'dexie';
import type{Card,Deck,MetaEntry,Project,ReviewLog,ReviewState}from'./core';

class MemoDB extends Dexie{
  projects!:Table<Project,string>;
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

    this.version(2).stores({
      projects:'id,name,order',
      decks:'id,projectId,name,source,order',
      cards:'id,deckId,source,order,*tags',
      states:'cardId,dueDay,lapses,lastReviewAt',
      logs:'++id,cardId,deckId,reviewedAt,rating',
      meta:'key'
    }).upgrade(async tx=>{
      const decks=tx.table('decks');
      await decks.toCollection().modify((deck:any)=>{
        if(deck.projectId)return;
        deck.projectId=deck.source==='fangge-cards'?'cet6':'software-architecture';
      });
    });
  }
}
export const db=new MemoDB();
