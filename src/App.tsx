import{useEffect,useId,useMemo,useRef,useState,type CSSProperties,type ReactNode}from'react';
import{db}from'./db';
import{seedBundledContent}from'./seed';
import{buildTodayQueue,dayNumber,schedule,type Card,type Deck,type Project,type Rating,type ReviewLog,type ReviewState}from'./core';

type View='home'|'decks'|'review'|'progress'|'done';
type Tally=Record<Rating,number>;
const labels:Record<Rating,string>={again:'不认识',hard:'眼熟',good:'认识'};
const marks:Record<Rating,string>={again:'×',hard:'△',good:'○'};
const SWIPE_DX=40,SWIPE_DY=60,EDGE_X=24,EDGE_DX=50;

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const haptic=(ms:number|number[]=8)=>{try{navigator.vibrate?.(ms);}catch{}};
const emptyTally=():Tally=>({again:0,hard:0,good:0});

export default function App(){
  const[view,setView]=useState<View>('home');
  const[projects,setProjects]=useState<Project[]>([]);
  const[decks,setDecks]=useState<Deck[]>([]);
  const[cards,setCards]=useState<Card[]>([]);
  const[states,setStates]=useState<ReviewState[]>([]);
  const[logs,setLogs]=useState<ReviewLog[]>([]);
  const[activeProjectId,setActiveProjectId]=useState('software-architecture');
  const[projectMenuOpen,setProjectMenuOpen]=useState(false);

  const[queue,setQueue]=useState<string[]>([]);
  const[position,setPosition]=useState(0);
  const[round,setRound]=useState(1);
  const[requeue,setRequeue]=useState<string[]>([]);
  const[flipped,setFlipped]=useState(false);
  const[locked,setLocked]=useState(false);
  const[stamp,setStamp]=useState<Rating|null>(null);
  const[tally,setTally]=useState<Tally>(emptyTally);

  const cardRef=useRef<HTMLElement|null>(null);
  const dragRef=useRef<HTMLDivElement|null>(null);
  const swipeStart=useRef<{x:number;y:number}|null>(null);
  const edgeStart=useRef<{x:number;y:number}|null>(null);

  const refresh=async()=>{
    const[nextProjects,nextDecks,nextCards,nextStates,nextLogs,active]=await Promise.all([
      db.projects.orderBy('order').toArray(),
      db.decks.orderBy('order').toArray(),
      db.cards.toArray(),
      db.states.toArray(),
      db.logs.orderBy('reviewedAt').reverse().toArray(),
      db.meta.get('activeProjectId')
    ]);
    setProjects(nextProjects);
    setDecks(nextDecks);
    setCards(nextCards);
    setStates(nextStates);
    setLogs(nextLogs);
    if(typeof active?.value==='string')setActiveProjectId(active.value);
  };

  useEffect(()=>{void seedBundledContent().then(refresh);},[]);

  const stateMap=useMemo(()=>new Map(states.map(s=>[s.cardId,s])),[states]);
  const cardMap=useMemo(()=>new Map(cards.map(c=>[c.id,c])),[cards]);
  const deckMap=useMemo(()=>new Map(decks.map(d=>[d.id,d])),[decks]);
  const today=dayNumber();

  const activeProject=projects.find(p=>p.id===activeProjectId)??projects[0];
  const activeDecks=useMemo(()=>decks.filter(d=>d.projectId===activeProjectId),[decks,activeProjectId]);
  const activeDeckIds=useMemo(()=>new Set(activeDecks.map(d=>d.id)),[activeDecks]);
  const activeCards=useMemo(()=>cards.filter(c=>activeDeckIds.has(c.deckId)),[cards,activeDeckIds]);
  const todayQueue=useMemo(()=>buildTodayQueue(activeCards,stateMap,today),[activeCards,stateMap,today]);

  const activeLogs=useMemo(()=>logs.filter(log=>activeDeckIds.has(log.deckId)),[logs,activeDeckIds]);
  const todayLogs=activeLogs.filter(x=>dayNumber(x.reviewedAt)===today);
  const accuracy=activeLogs.length?Math.round(activeLogs.filter(x=>x.rating==='good').length/activeLogs.length*100):0;
  const streak=useMemo(()=>{
    const days=new Set(activeLogs.map(x=>dayNumber(x.reviewedAt)));let n=0;
    for(let d=today;days.has(d);d--)n++;
    return n;
  },[activeLogs,today]);
  const week=useMemo(()=>{
    const a=Array.from({length:7},(_,i)=>({day:today-6+i,count:0}));
    for(const log of activeLogs){
      const x=a.find(v=>v.day===dayNumber(log.reviewedAt));
      if(x)x.count++;
    }
    return a;
  },[activeLogs,today]);

  const previewDeck=useMemo(()=>{
    const lastLog=activeLogs.find(log=>activeDeckIds.has(log.deckId));
    if(lastLog)return deckMap.get(lastLog.deckId)??activeDecks[0];
    return activeDecks[0];
  },[activeLogs,activeDeckIds,deckMap,activeDecks]);

  const previewCard=useMemo(()=>{
    if(!previewDeck)return undefined;
    const lastLog=activeLogs.find(log=>log.deckId===previewDeck.id);
    if(lastLog)return cardMap.get(lastLog.cardId)??cards.find(c=>c.deckId===previewDeck.id);
    return cards.find(c=>c.deckId===previewDeck.id);
  },[previewDeck,activeLogs,cardMap,cards]);

  const chooseProject=async(projectId:string)=>{
    setActiveProjectId(projectId);
    setProjectMenuOpen(false);
    await db.meta.put({key:'activeProjectId',value:projectId});
  };

  const startReview=async(ids:string[],deckId?:string)=>{
    if(!ids.length)return;
    setQueue(ids);
    setPosition(0);
    setRound(1);
    setRequeue([]);
    setFlipped(false);
    setLocked(false);
    setStamp(null);
    setTally(emptyTally());
    setView('review');
    if(deckId)await db.meta.put({key:'lastDeckId',value:deckId});
  };

  const startDeck=async(deckId:string)=>{
    const list=cards.filter(c=>c.deckId===deckId).sort((a,b)=>a.order-b.order);
    const ids=buildTodayQueue(list,stateMap,today,10,20);
    await startReview(ids.length?ids:list.slice(0,20).map(c=>c.id),deckId);
  };

  const startToday=async()=>{
    if(!todayQueue.length)return;
    await db.meta.put({key:'lastProjectId',value:activeProjectId});
    await startReview(todayQueue);
  };

  const current=cardMap.get(queue[position]);

  const resetCardVisual=()=>{
    setFlipped(false);
    setLocked(false);
    setStamp(null);
  };

  const advance=(againId?:string)=>{
    if(position+1<queue.length){
      if(againId&&round===1)setRequeue(xs=>xs.includes(againId)?xs:[...xs,againId]);
      setPosition(p=>p+1);
      resetCardVisual();
      return;
    }

    const nextRound=round===1?[...new Set([...requeue,...(againId?[againId]:[])])]:[];
    if(nextRound.length){
      setQueue(nextRound);
      setPosition(0);
      setRound(2);
      setRequeue([]);
      resetCardVisual();
      return;
    }

    void refresh();
    setView('done');
  };

  const persistRating=async(rating:Rating)=>{
    if(!current)return;
    const previous=stateMap.get(current.id);
    const next=schedule(previous,current.id,rating,Date.now(),round>1);

    await db.transaction('rw',db.states,db.logs,db.meta,async()=>{
      await db.states.put(next);
      await db.logs.add({
        cardId:current.id,
        deckId:current.deckId,
        reviewedAt:next.lastReviewAt!,
        rating,
        previousIntervalDays:previous?.intervalDays??0,
        nextIntervalDays:next.intervalDays,
        dueDay:next.dueDay
      });
      await db.meta.put({key:'lastCardId',value:current.id});
      await db.meta.put({key:'lastDeckId',value:current.deckId});
      const projectId=deckMap.get(current.deckId)?.projectId;
      if(projectId)await db.meta.put({key:'lastProjectId',value:projectId});
    });

    setStates(old=>[...old.filter(x=>x.cardId!==current.id),next]);
    setTally(t=>({...t,[rating]:t[rating]+1}));
  };

  const playJudgment=async(rating:Rating)=>{
    setStamp(rating);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await wait(reduced?140:640);
    advance(rating==='again'?current?.id:undefined);
  };

  const rate=async(rating:Rating,fromSwipe=false)=>{
    if(!current||locked)return;
    if(!fromSwipe&&!flipped)return;

    setLocked(true);
    haptic(rating==='good'?10:rating==='hard'?[6,40,6]:18);
    await persistRating(rating);

    if(fromSwipe&&!flipped){
      setFlipped(true);
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await wait(reduced?0:500);
    }

    await playJudgment(rating);
  };

  const toggleFlip=()=>{
    if(locked)return;
    setFlipped(v=>!v);
    setStamp(null);
  };

  const swipeVerdict=(sx:number,sy:number,ex:number,ey:number):Rating|null=>{
    const dx=ex-sx,dy=ey-sy;
    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>=SWIPE_DX)return dx<0?'again':'good';
    if(dy>=SWIPE_DY&&dy>Math.abs(dx))return'hard';
    return null;
  };

  const setDrag=(dx:number,dy:number)=>{
    const layer=dragRef.current;
    if(!layer)return;
    const down=Math.max(0,dy);
    layer.classList.add('dragging');
    layer.style.transform=`translate3d(${dx*.92}px,${down*.55}px,0) rotate(${dx*.045}deg)`;
    layer.style.setProperty('--again',String(Math.min(1,Math.max(0,-dx/SWIPE_DX-.25))));
    layer.style.setProperty('--good',String(Math.min(1,Math.max(0,dx/SWIPE_DX-.25))));
    layer.style.setProperty('--hard',String(Math.abs(dx)<down?Math.min(1,Math.max(0,down/SWIPE_DY-.25)):0));
  };
  const releaseDrag=()=>{
    const layer=dragRef.current;
    if(!layer)return;
    layer.classList.remove('dragging');
    layer.style.transform='';
    for(const k of['--again','--good','--hard'])layer.style.setProperty(k,'0');
  };

  useEffect(()=>{
    const card=cardRef.current;
    if(!card||view!=='review')return;

    const move=(event:TouchEvent)=>{
      if(!swipeStart.current)return;
      const t=event.touches[0];
      const dx=t.clientX-swipeStart.current.x;
      const dy=t.clientY-swipeStart.current.y;
      if(dy>0&&dy>Math.abs(dx))event.preventDefault();
      if(Math.abs(dx)>10)event.preventDefault();
      if(!(dx>0&&swipeStart.current.x<=EDGE_X))setDrag(dx,dy);
    };

    card.addEventListener('touchmove',move,{passive:false});
    return()=>card.removeEventListener('touchmove',move);
  },[view,current]);

  useEffect(()=>{
    if(view!=='review')return;

    const onStart=(event:TouchEvent)=>{
      const x=event.touches[0]?.clientX??999;
      edgeStart.current=x<=EDGE_X?{x,y:event.touches[0].clientY}:null;
    };
    const onEnd=(event:TouchEvent)=>{
      if(!edgeStart.current)return;
      const start=edgeStart.current;
      edgeStart.current=null;
      const dx=event.changedTouches[0].clientX-start.x;
      const dy=event.changedTouches[0].clientY-start.y;
      if(dx>=EDGE_DX&&Math.abs(dy)<80){
        setView('home');
        resetCardVisual();
      }
    };

    document.addEventListener('touchstart',onStart,{passive:true});
    document.addEventListener('touchend',onEnd,{passive:true});
    return()=>{
      document.removeEventListener('touchstart',onStart);
      document.removeEventListener('touchend',onEnd);
    };
  },[view]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(view!=='review')return;
      if(e.key===' '||e.key==='Enter'){
        e.preventDefault();
        toggleFlip();
        return;
      }
      if(!flipped||locked)return;
      if(e.key==='1')void rate('again');
      if(e.key==='2')void rate('hard');
      if(e.key==='3')void rate('good');
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });

  if(view==='done'){
    const total=tally.again+tally.hard+tally.good;
    const goodRate=total?Math.round(tally.good/total*100):0;
    return <main className="review-shell done-shell view-panel review-enter">
      <header className="review-header">
        <button className="ghost back" onClick={()=>setView('home')}><Icon name="back"/>首页</button>
      </header>
      <section className="done-card">
        <div className="done-seal" aria-hidden="true"><Stamp rating="good"/></div>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>本轮完成</h1>
        <p className="done-sub">{activeProject?.name} · 共 {total} 次评级 · 认识率 {goodRate}%</p>
        <div className="done-tally">
          {(['again','hard','good']as Rating[]).map((r,i)=><div key={r} style={{'--i':i}as CSSProperties}>
            <b>{marks[r]}</b><strong>{tally[r]}</strong><span>{labels[r]}</span>
          </div>)}
        </div>
        <div className="done-actions">
          {todayQueue.length>0&&<button className="cta pressable" onClick={()=>void startToday()}>继续复习 · {todayQueue.length}<span>→</span></button>}
          <button className="secondary pressable" onClick={()=>setView('home')}>回到首页</button>
        </div>
      </section>
    </main>;
  }

  if(view==='review'&&current){
    const progress=(position+(locked?1:0))/queue.length*100;
    return <main className="review-shell view-panel review-enter">
      <header className="review-header">
        <button className="ghost back" onClick={()=>setView('home')}><Icon name="back"/>返回</button>
        <div className="review-meta">
          <span className={round>1?'pill hot':'pill'}>{round===1?'第 1 遍':'错题复习'}</span>
          <strong><em key={position}>{position+1}</em> / {queue.length}</strong>
        </div>
      </header>
      <div className="review-progress" aria-hidden="true"><i style={{width:progress+'%'}}/></div>

      <div className="review-stage">
        <div className="drag-layer" ref={dragRef}>
        <div className="swipe-hint again" aria-hidden="true">× 不认识</div>
        <div className="swipe-hint good" aria-hidden="true">认识 ○</div>
        <div className="swipe-hint hard" aria-hidden="true">△ 眼熟</div>
        <div className="holder" key={queue[position]+'-'+round}>
          <section
            ref={cardRef}
            className={'card '+(flipped?'flipped ':'')+(locked?'locked':'')}
            aria-pressed={flipped}
            onClick={toggleFlip}
            onTouchStart={e=>{
              if(locked){swipeStart.current=null;return;}
              const t=e.touches[0];
              swipeStart.current={x:t.clientX,y:t.clientY};
            }}
            onTouchCancel={()=>{swipeStart.current=null;releaseDrag();}}
            onTouchEnd={e=>{
              releaseDrag();
              if(!swipeStart.current||locked){swipeStart.current=null;return;}
              const start=swipeStart.current;
              swipeStart.current=null;
              const t=e.changedTouches[0];
              const dx=t.clientX-start.x;
              if(dx>0&&start.x<=EDGE_X)return;
              const verdict=swipeVerdict(start.x,start.y,t.clientX,t.clientY);
              if(verdict){
                e.preventDefault();
                void rate(verdict,true);
              }
            }}
          >
            <div className="face front">
              <div className="card-kicker">{current.tags.join(' · ')||'FLASHCARD'}</div>
              <div className="card-main"><h1>{current.front}</h1></div>
              <div className="card-foot">轻点翻面 · 左滑不认识 · 右滑认识 · 下滑眼熟</div>
            </div>

            <div className="face back">
              <div className={'stamp-slot '+(stamp?'show':'')} aria-hidden="true">
                {stamp&&<Stamp rating={stamp}/>}
              </div>
              <div className="card-kicker">{deckMap.get(current.deckId)?.name??'ANSWER'}</div>
              <div className="card-main">
                {current.note&&<small className="answer-note">{current.note}</small>}
                <p className="answer-text">{current.back}</p>
              </div>
              <div className="card-foot">轻点可翻回正面</div>
            </div>
          </section>
        </div>
        </div>
      </div>

      <div className="rating-row">
        {(['again','hard','good']as Rating[]).map((rating,i)=>
          <button key={rating} className={'pressable r-'+rating+(stamp===rating?' picked':'')} disabled={!flipped||locked} onClick={()=>void rate(rating)}>
            <b>{marks[rating]}</b><span>{labels[rating]}</span><kbd>{i+1}</kbd>
          </button>
        )}
      </div>
    </main>;
  }

  const go=(next:View)=>{
    if(next!==view){haptic(6);setProjectMenuOpen(false);setView(next);window.scrollTo({top:0});}
  };
  const tabs:[View,string,string][]=[['home','今日','Today'],['decks','卡组','Decks'],['progress','轨迹','Progress']];

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={()=>go('home')}>
        <DotMark/><strong>MEMO</strong>
      </button>
      <nav className="top-nav">
        {tabs.slice(1).map(([id,,en])=><button key={id} className={view===id?'active':''} onClick={()=>go(id)}>{en}</button>)}
      </nav>
    </header>

    <nav className="tabbar" aria-label="主导航">
      {tabs.map(([id,cn])=><button key={id} className={'pressable '+(view===id?'active':'')} aria-current={view===id?'page':undefined} onClick={()=>go(id)}>
        <Icon name={id}/><span>{cn}</span>
        {id==='home'&&todayQueue.length>0&&<b className="badge">{todayQueue.length}</b>}
      </button>)}
    </nav>

    {view==='home'&&<div className="view-panel home-enter" key="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">MEMORY / REVIEW / TRACE</p>
          <h1>FLASHCARDS</h1>
          <p className="hero-cn">{activeProject?.name??'记忆 · 复习 · 追踪'}</p>
          <p className="hero-note">{activeProject?.description??'把每天真正需要记住的东西，留在一张安静的卡片上。'}</p>
          <button className="cta pressable" disabled={!todayQueue.length} onClick={()=>void startToday()}>
            {todayQueue.length?`开始今日复习 · ${todayQueue.length}`:'今日已清空'} <span>→</span>
          </button>
        </div>

        <div className="hero-card-stack" aria-label={previewDeck?`最近使用：${previewDeck.name}`:'卡片预览'}>
          <div className="ghost-card">
            <span>BACK</span>
            <p>{previewCard?.back??'选择一个项目开始建立你的学习轨迹。'}</p>
          </div>
          <div className="demo-card">
            <span>FRONT</span>
            <h2>{previewCard?.front??'MEMO'}</h2>
            <p>{previewDeck?.name??activeProject?.name??'Flashcards'}</p>
            <small>{previewDeck?.cardCount??activeCards.length} cards</small>
          </div>
        </div>

        <aside className="stats-rail">
          <Stat label="TODAY" value={String(todayLogs.length)} sub="已学习卡片"/>
          <Stat label="STREAK" value={String(streak)} sub="连续学习天数"/>
          <Stat label="ACCURACY" value={accuracy+'%'} sub="认识率"/>
          <MiniWeek values={week.map(x=>x.count)}/>
        </aside>
      </section>

      <section className="project-strip">
        <div className="section-title"><strong>我的项目</strong><button onClick={()=>go('decks')}>查看当前项目卡组 →</button></div>
        <div className="project-grid">
          {projects.map((project,i)=><ProjectTile
            key={project.id}
            index={i}
            project={project}
            active={project.id===activeProjectId}
            decks={decks}
            cards={cards}
            states={stateMap}
            today={today}
            onChoose={()=>void chooseProject(project.id)}
          />)}
        </div>
      </section>
    </div>}

    {view==='decks'&&<section className="page-section view-panel page-enter" key="decks">
      <div className="page-project-row">
        <button className={'project-trigger inline pressable '+(projectMenuOpen?'open':'')} aria-expanded={projectMenuOpen} onClick={()=>setProjectMenuOpen(v=>!v)}>
          <ProjectSwatch projectId={activeProjectId} small/><span><small>PROJECT</small><strong>{activeProject?.name??'选择项目'}</strong></span><b>⌄</b>
        </button>
        {projectMenuOpen&&<ProjectMenu
          projects={projects}
          decks={decks}
          cards={cards}
          states={stateMap}
          today={today}
          activeProjectId={activeProjectId}
          onChoose={id=>void chooseProject(id)}
        />}
      </div>
      <p className="eyebrow">LIBRARY</p>
      <h1 className="page-title">卡组</h1>
      <div className="deck-list">
        {activeDecks.map((deck,i)=><DeckRow key={deck.id} index={i} deck={deck} cards={cards} states={stateMap} today={today} onOpen={()=>void startDeck(deck.id)}/>)}
      </div>
    </section>}

    {view==='progress'&&<section className="page-section view-panel page-enter" key="progress">
      <p className="eyebrow">LEARNING TRACE · {activeProject?.name?.toUpperCase()}</p>
      <h1 className="page-title">学习轨迹</h1>
      <div className="progress-cards">
        <Stat label="TOTAL REVIEWS" value={String(activeLogs.length)} sub="累计复习次数"/>
        <Stat label="TODAY" value={String(todayLogs.length)} sub="今日复习"/>
        <Stat label="STREAK" value={String(streak)} sub="连续学习天数"/>
        <Stat label="GOOD" value={accuracy+'%'} sub="认识率"/>
      </div>
      <div className="week-panel"><h2>最近七天</h2><MiniWeek values={week.map(x=>x.count)} large/></div>
      <p className="muted-note">统计按当前 Project 聚合；切换项目后，Today、Streak、Accuracy 和七日学习量会一起切换。</p>
    </section>}
  </main>;
}

function Stamp({rating}:{rating:Rating}){
  if(rating==='good')return <svg viewBox="0 0 56 56"><circle className="trace" cx="28" cy="28" r="20" pathLength="100"/></svg>;
  if(rating==='hard')return <svg viewBox="0 0 56 56"><path className="trace" d="M28 12 L48 44 H8 Z" pathLength="100"/></svg>;
  return <svg viewBox="0 0 56 56"><path className="trace" d="M14 14 L42 42" pathLength="100"/><path className="trace t2" d="M42 14 L14 42" pathLength="100"/></svg>;
}

function DotMark({compact=false}:{compact?:boolean}){
  return <span className={'mark '+(compact?'compact':'')}>{Array.from({length:9},(_,i)=><i key={i}/>)}</span>;
}

function ProjectMenu({projects,decks,cards,states,today,activeProjectId,onChoose}:{
  projects:Project[];decks:Deck[];cards:Card[];states:Map<string,ReviewState>;today:number;activeProjectId:string;onChoose:(id:string)=>void
}){
  return <div className="project-menu">
    {projects.map(project=>{
      const deckIds=new Set(decks.filter(d=>d.projectId===project.id).map(d=>d.id));
      const list=cards.filter(c=>deckIds.has(c.deckId));
      const q=buildTodayQueue(list,states,today);
      return <button key={project.id} className={project.id===activeProjectId?'active':''} onClick={()=>onChoose(project.id)}>
        <ProjectSwatch projectId={project.id} small/>
        <span>{project.name}<small>{project.description}</small></span><strong>{q.length}</strong>
      </button>;
    })}
  </div>;
}

function ProjectTile({project,index,active,decks,cards,states,today,onChoose}:{
  project:Project;index:number;active:boolean;decks:Deck[];cards:Card[];states:Map<string,ReviewState>;today:number;onChoose:()=>void
}){
  const deckIds=new Set(decks.filter(d=>d.projectId===project.id).map(d=>d.id));
  const list=cards.filter(c=>deckIds.has(c.deckId));
  const due=buildTodayQueue(list,states,today).length;
  return <button className={'project-tile pressable stagger '+(active?'active':'')} style={{'--i':index}as CSSProperties} aria-pressed={active} onClick={()=>{haptic(6);onChoose();}}>
    <ProjectSwatch projectId={project.id}/>
    <div className="project-copy"><small>{active?'DAILY PROJECT':'PROJECT'}</small><h3>{project.name}</h3><p>{deckIds.size} 个卡组 · {list.length} 张卡</p></div>
    <div className={'project-due '+(due?'':'clear')}><strong>{due||'✓'}</strong><span>{due?'今日':'已清空'}</span></div>
  </button>;
}

/* Riso-style ink stamp: rough edge (displacement), knocked-out grain and a misregistered accent pass. */
type SwatchKind='hatch'|'lines'|'rings'|'halftone';
const swatchKinds:Record<string,SwatchKind>={'software-architecture':'hatch',cet6:'lines','high-math':'rings','complex-analysis':'halftone'};
const hashString=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};
const rng=(seed:number)=>()=>{seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

function swatchArt(kind:SwatchKind,seed:number){
  const r=rng(seed),C=50,R=39;
  const els:ReactNode[]=[];
  if(kind==='hatch'){
    for(let k=-63;k<=63;k+=7)els.push(<line key={'a'+k} x1={C+k-60} y1={C-60} x2={C+k+60} y2={C+60} strokeWidth={3+r()*.8}/>);
    for(let k=14;k<=63;k+=7)els.push(<line key={'b'+k} x1={C+k-60} y1={C+60} x2={C+k+60} y2={C-60} strokeWidth={1.8+k/40}/>);
  }else if(kind==='lines'){
    for(let y=C-R+5;y<=C+R-2;y+=7.4){
      const half=Math.sqrt(Math.max(0,R*R-(y-C)**2));
      const a=C-half-3+r()*5,b=C+half+3-(r()<.35?half*(.4+r()*.6):r()*4);
      els.push(<line key={y} x1={a} y1={y} x2={b} y2={y} strokeWidth={3.8+r()*.8} strokeLinecap="round"/>);
    }
  }else if(kind==='rings'){
    const cx=C-8,cy=C-7;
    els.push(<circle key="core" cx={cx} cy={cy} r={2.6} stroke="none"/>);
    for(let rad=7;rad<64;rad+=7)els.push(<circle key={rad} cx={cx+r()*1.2} cy={cy+r()*1.2} r={rad} fill="none" strokeWidth={2.4+rad/28}/>);
  }else{
    const step=7.4;
    for(let row=0,y=C-R-4;y<=C+R+4;y+=step,row++)for(let x=C-R-4;x<=C+R+4;x+=step){
      const px=x+(row%2?step/2:0);
      const d=Math.hypot(px-26,y-24)/80;
      const dot=Math.min(4.4,Math.max(.5,d*4.6));
      els.push(<circle key={px+'-'+y} cx={px} cy={y} r={dot} stroke="none"/>);
    }
  }
  return els;
}

function ProjectSwatch({projectId,small=false}:{projectId:string;small?:boolean}){
  const uid=useId().replace(/[^a-zA-Z0-9]/g,'');
  const seed=hashString(projectId);
  const kind=swatchKinds[projectId]??(['hatch','lines','rings','halftone']as SwatchKind[])[seed%4];
  const art=useMemo(()=>swatchArt(kind,seed),[kind,seed]);
  const tilt=(seed%17)-8;
  return <span className={'project-swatch '+kind+(small?' small':'')} aria-hidden="true">
    <svg viewBox="0 0 100 100" style={{rotate:tilt+'deg'}}>
      <defs>
        <filter id={'ink'+uid} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed={seed%97} result="warp"/>
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed={(seed>>3)%97} result="grain"/>
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4.2 0 0 0 -.9" result="speckle"/>
          <feComposite in="rough" in2="speckle" operator="in"/>
        </filter>
        <clipPath id={'disc'+uid}><circle cx="50" cy="50" r="39"/></clipPath>
      </defs>
      <g filter={`url(#ink${uid})`}>
        <circle className="riso" cx="54.5" cy="53" r="38"/>
        <g className="ink" clipPath={`url(#disc${uid})`} stroke="currentColor" fill="currentColor">{art}</g>
        <circle className="rim" cx="50" cy="50" r="39.5"/>
      </g>
    </svg>
  </span>;
}

function Icon({name}:{name:string}){
  const paths:Record<string,ReactNode>={
    home:<><rect x="4" y="6" width="13" height="15" rx="1.5"/><path d="M8 3h10.5A1.5 1.5 0 0 1 20 4.5V17"/></>,
    decks:<><path d="M3 8l9-4 9 4-9 4z"/><path d="M3 12l9 4 9-4"/><path d="M3 16l9 4 9-4"/></>,
    progress:<><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/></>,
    back:<path d="M15 5l-7 7 7 7"/>
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Stat({label,value,sub}:{label:string;value:string;sub:string}){
  return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}

function MiniWeek({values,large=false}:{values:number[];large?:boolean}){
  const max=Math.max(1,...values);
  return <div className={'mini-week '+(large?'large':'')}>
    {values.map((v,i)=><i key={i} style={{height:`${Math.max(10,v/max*100)}%`}} title={String(v)}/>)}
  </div>;
}

function DeckRow({deck,index,cards,states,today,onOpen}:{deck:Deck;index:number;cards:Card[];states:Map<string,ReviewState>;today:number;onOpen:()=>void}){
  const s=deckSummary(deck.id,cards,states,today);
  const learned=s.total?(s.total-s.fresh)/s.total:0;
  return <button className="deck-row pressable stagger" style={{'--i':Math.min(index,12)}as CSSProperties} onClick={onOpen}>
    <div><h3>{deck.name}</h3><p>{deck.description}</p><span className="deck-meter"><i style={{width:learned*100+'%'}}/></span></div>
    <div className="deck-numbers"><strong>{s.due}</strong><span>待复习</span><small>{s.fresh} 新卡 / {s.total} 总计</small></div>
  </button>;
}

function deckSummary(deckId:string,cards:Card[],states:Map<string,ReviewState>,today:number){
  const list=cards.filter(c=>c.deckId===deckId);
  let due=0,fresh=0;
  for(const c of list){
    const s=states.get(c.id);
    if(!s)fresh++;
    else if(s.dueDay<=today)due++;
  }
  return{due,fresh,total:list.length};
}
