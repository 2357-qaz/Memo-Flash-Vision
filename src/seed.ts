import{db}from'./db';
import architecture from'./data/architecture.json';
import cet6 from'./data/cet6.json';
import highMath from'./data/high-math.json';
import complex from'./data/complex.json';
import type{Card,Deck,Project}from'./core';

const SEED_VERSION=3;

const projects:Project[]=[
  {
    id:'software-architecture',
    name:'软件架构',
    description:'架构基础、DDD、微服务、分布式、数据与缓存、可靠性。',
    order:1
  },
  {
    id:'cet6',
    name:'CET-6',
    description:'六级核心词汇与每日记忆任务。',
    order:2
  },
  {
    id:'high-math',
    name:'高数',
    description:'曲线曲面积分、二重积分、Green 公式与无穷级数。',
    order:3
  },
  {
    id:'complex-analysis',
    name:'复变',
    description:'复数与复变换、解析函数、复积分与留数。',
    order:4
  }
];

export async function seedBundledContent(){
  const current=await db.meta.get('seedVersion');
  if(current?.value===SEED_VERSION)return;

  const decks=[
    ...(architecture.decks as Omit<Deck,'projectId'>[]).map(deck=>({...deck,projectId:'software-architecture'})),
    ...(cet6.decks as Omit<Deck,'projectId'>[]).map(deck=>({...deck,projectId:'cet6'})),
    ...(highMath.decks as Omit<Deck,'projectId'>[]).map(deck=>({...deck,projectId:'high-math'})),
    ...(complex.decks as Omit<Deck,'projectId'>[]).map(deck=>({...deck,projectId:'complex-analysis'}))
  ] as Deck[];

  const cards=[
    ...(architecture.cards as Card[]),
    ...(cet6.cards as Card[]),
    ...(highMath.cards as Card[]),
    ...(complex.cards as Card[])
  ];

  await db.transaction('rw',db.projects,db.decks,db.cards,db.meta,async()=>{
    await db.projects.bulkPut(projects);
    await db.decks.bulkPut(decks);
    await db.cards.bulkPut(cards);
    await db.meta.put({key:'seedVersion',value:SEED_VERSION});

    const active=await db.meta.get('activeProjectId');
    if(!active)await db.meta.put({key:'activeProjectId',value:'software-architecture'});
  });
}
