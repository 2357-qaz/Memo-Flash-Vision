import{useEffect,useMemo,useRef,useState}from'react';
import{db}from'./db';
import{seedBundledContent}from'./seed';
import{buildTodayQueue,dayNumber,schedule,type Card,type Deck,type Rating,type ReviewLog,type ReviewState}from'./core';

type View='home'|'decks'|'review'|'progress';
const labels:Record<Rating,string>={again:'不认识',hard:'眼熟',good:'认识'};

export default function App(){
  const[view,setView]=useState<View>('home');
  const[decks,setDecks]=useState<Deck[]>([]);
  const[cards,setCards]=useState<Card[]>([]);
  const[states,setStates]=useState<ReviewState[]>([]);
  const[logs,setLogs]=useState<ReviewLog[]>([]);
  const[queue,setQueue]=useState<string[]>([]);
  const[position,setPosition]=useState(0);
  const[round,setRound]=useState(1);
  const[requeue,setRequeue]=useState<string[]>([]);
  const[revealed,setRevealed]=useState(false);
  const touchStart=useRef<{x:number;y:number}|null>(null);

  const refresh=async()=>{
    const[nextDecks,nextCards,nextStates,nextLogs]=await Promise.all([
      db.decks.orderBy('order').toArray(),db.cards.toArray(),db.states.toArray(),db.logs.orderBy('reviewedAt').reverse().toArray()
    ]);
    setDecks(nextDecks);setCards(nextCards);setStates(nextStates);setLogs(nextLogs);
  };
  useEffect(()=>{seedBundledContent().then(refresh);},[]);

  const stateMap=useMemo(()=>new Map(states.map(s=>[s.cardId,s])),[states]);
  const cardMap=useMemo(()=>new Map(cards.map(c=>[c.id,c])),[cards]);
  const today=dayNumber();
  const todayQueue=useMemo(()=>buildTodayQueue(cards,stateMap,today),[cards,stateMap,today]);
  const todayLogs=logs.filter(x=>dayNumber(x.reviewedAt)===today);
  const accuracy=logs.length?Math.round(logs.filter(x=>x.rating==='good').length/logs.length*100):0;
  const streak=useMemo(()=>{
    const days=new Set(logs.map(x=>dayNumber(x.reviewedAt)));let n=0;
    for(let d=today;days.has(d);d--)n++;return n;
  },[logs,today]);
  const week=useMemo(()=>{
    const a=Array.from({length:7},(_,i)=>({day:today-6+i,count:0}));
    for(const log of logs){const x=a.find(v=>v.day===dayNumber(log.reviewedAt));if(x)x.count++;}
    return a;
  },[logs,today]);

  const startReview=(ids:string[])=>{if(!ids.length)return;setQueue(ids);setPosition(0);setRound(1);setRequeue([]);setRevealed(false);setView('review');};
  const startDeck=(deckId:string)=>{
    const list=cards.filter(c=>c.deckId===deckId).sort((a,b)=>a.order-b.order);
    const ids=buildTodayQueue(list,stateMap,today,10,20);
    startReview(ids.length?ids:list.slice(0,20).map(c=>c.id));
  };
  const current=cardMap.get(queue[position]);

  const advance=(againId?:string)=>{
    if(againId&&round===1)setRequeue(xs=>xs.includes(againId)?xs:[...xs,againId]);
    if(position+1<queue.length){setPosition(position+1);setRevealed(false);return;}
    const nextRound=round===1?[...new Set([...requeue,...(againId?[againId]:[])])]:[];
    if(nextRound.length){setQueue(nextRound);setPosition(0);setRound(2);setRequeue([]);setRevealed(false);return;}
    refresh();setView('home');
  };

  const rate=async(rating:Rating)=>{
    if(!current||!revealed)return;
    const previous=stateMap.get(current.id),next=schedule(previous,current.id,rating);
    await db.transaction('rw',db.states,db.logs,async()=>{
      await db.states.put(next);
      await db.logs.add({cardId:current.id,deckId:current.deckId,reviewedAt:next.lastReviewAt!,rating,
        previousIntervalDays:previous?.intervalDays??0,nextIntervalDays:next.intervalDays,dueDay:next.dueDay});
    });
    setStates(old=>[...old.filter(x=>x.cardId!==current.id),next]);
    advance(rating==='again'?current.id:undefined);
  };

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(view!=='review')return;
      if(e.key===' '||e.key==='Enter'){e.preventDefault();setRevealed(true);return;}
      if(!revealed)return;
      if(e.key==='1')void rate('again');if(e.key==='2')void rate('hard');if(e.key==='3')void rate('good');
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  });

  if(view==='review'&&current)return <main className="review-shell">
    <header className="review-header"><button className="ghost" onClick={()=>setView('home')}>← 返回</button>
      <div className="review-meta"><span>{round===1?'第一遍':'错题复习'}</span><strong>{position+1} / {queue.length}</strong></div></header>
    <section className={'study-card '+(revealed?'revealed':'')} onClick={()=>setRevealed(true)}
      onTouchStart={e=>{const t=e.changedTouches[0];touchStart.current={x:t.clientX,y:t.clientY};}}
      onTouchEnd={e=>{if(!revealed||!touchStart.current)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.current.x,dy=t.clientY-touchStart.current.y;touchStart.current=null;
        if(Math.max(Math.abs(dx),Math.abs(dy))<55)return;
        if(Math.abs(dx)>Math.abs(dy))void rate(dx>0?'good':'again');else if(dy>0)void rate('hard');
      }}>
      <div className="card-kicker">{current.tags.join(' · ')||'FLASHCARD'}</div>
      <div className="card-main"><h1>{current.front}</h1>{revealed&&<div className="answer"><div className="rule"/><p>{current.back}</p>{current.note&&<small>{current.note}</small>}</div>}</div>
      <div className="card-foot">{revealed?'← 不认识 · ↓ 眼熟 · 认识 →':'轻点翻面 · Space'}</div>
    </section>
    <div className="rating-row">{(['again','hard','good']as Rating[]).map((r,i)=><button key={r} disabled={!revealed} onClick={()=>void rate(r)}>
      <b>{['×','△','○'][i]}</b><span>{labels[r]}</span><kbd>{i+1}</kbd></button>)}</div>
  </main>;

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={()=>setView('home')}><span className="mark">{Array.from({length:9},(_,i)=><i key={i}/>)}</span><strong>MEMO</strong></button>
      <nav><button className={view==='decks'?'active':''} onClick={()=>setView('decks')}>Decks</button><button className={view==='progress'?'active':''} onClick={()=>setView('progress')}>Progress</button></nav></header>

    {view==='home'&&<><section className="hero"><div className="hero-copy"><p className="eyebrow">MEMORY / REVIEW / TRACE</p><h1>FLASHCARDS</h1><p className="hero-cn">记忆 · 复习 · 追踪</p>
      <p className="hero-note">把每天真正需要记住的东西，留在一张安静的卡片上。</p><button className="cta" disabled={!todayQueue.length} onClick={()=>startReview(todayQueue)}>
        {todayQueue.length?`开始今日复习 · ${todayQueue.length}`:'今日已清空'} <span>→</span></button></div>
      <div className="hero-card-stack" aria-hidden="true"><div className="ghost-card"><span>BACK</span><p>边界积分与区域积分的关系</p></div><div className="demo-card"><span>FRONT</span><h2>Green 公式</h2><p>复变函数</p><small>1 / 38</small></div></div>
      <aside className="stats-rail"><Stat label="TODAY" value={String(todayLogs.length)} sub="已学习卡片"/><Stat label="STREAK" value={String(streak)} sub="连续学习天数"/>
        <Stat label="ACCURACY" value={accuracy+'%'} sub="认识率"/><MiniWeek values={week.map(x=>x.count)}/></aside></section>
      <section className="deck-strip"><div className="section-title"><strong>我的卡组</strong><button onClick={()=>setView('decks')}>查看全部 →</button></div><div className="deck-grid">
        {decks.slice(0,3).map(d=><DeckTile key={d.id} deck={d} cards={cards} states={stateMap} today={today} onOpen={()=>startDeck(d.id)}/>)}</div></section></>}

    {view==='decks'&&<section className="page-section"><p className="eyebrow">LIBRARY</p><h1 className="page-title">卡组</h1><div className="deck-list">
      {decks.map(d=><DeckRow key={d.id} deck={d} cards={cards} states={stateMap} today={today} onOpen={()=>startDeck(d.id)}/>)}</div></section>}

    {view==='progress'&&<section className="page-section"><p className="eyebrow">LEARNING TRACE</p><h1 className="page-title">学习轨迹</h1>
      <div className="progress-cards"><Stat label="TOTAL REVIEWS" value={String(logs.length)} sub="累计复习次数"/><Stat label="TODAY" value={String(todayLogs.length)} sub="今日复习"/>
        <Stat label="STREAK" value={String(streak)} sub="连续学习天数"/><Stat label="GOOD" value={accuracy+'%'} sub="认识率"/></div>
      <div className="week-panel"><h2>最近七天</h2><MiniWeek values={week.map(x=>x.count)} large/></div>
      <p className="muted-note">Alpha 0 从第一天保存逐次 ReviewLog，所以这里使用真实历史数据，不做假仪表盘。</p></section>}
  </main>;
}

function Stat({label,value,sub}:{label:string;value:string;sub:string}){return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;}
function MiniWeek({values,large=false}:{values:number[];large?:boolean}){const max=Math.max(1,...values);return <div className={'mini-week '+(large?'large':'')}>
  {values.map((v,i)=><i key={i} style={{height:`${Math.max(10,v/max*100)}%`}} title={String(v)}/>)}</div>;}
function DeckTile({deck,cards,states,today,onOpen}:{deck:Deck;cards:Card[];states:Map<string,ReviewState>;today:number;onOpen:()=>void}){const s=deckSummary(deck.id,cards,states,today);return <button className="deck-tile" onClick={onOpen}>
  <div className="texture"/><div><h3>{deck.name}</h3><p>{s.due} 待复习 · {s.fresh} 新卡</p></div><span>{s.total} →</span></button>;}
function DeckRow({deck,cards,states,today,onOpen}:{deck:Deck;cards:Card[];states:Map<string,ReviewState>;today:number;onOpen:()=>void}){const s=deckSummary(deck.id,cards,states,today);return <button className="deck-row" onClick={onOpen}>
  <div><h3>{deck.name}</h3><p>{deck.description}</p></div><div className="deck-numbers"><strong>{s.due}</strong><span>待复习</span><small>{s.fresh} 新卡 / {s.total} 总计</small></div></button>;}
function deckSummary(deckId:string,cards:Card[],states:Map<string,ReviewState>,today:number){const list=cards.filter(c=>c.deckId===deckId);let due=0,fresh=0;for(const c of list){const s=states.get(c.id);if(!s)fresh++;else if(s.dueDay<=today)due++;}return{due,fresh,total:list.length};}
