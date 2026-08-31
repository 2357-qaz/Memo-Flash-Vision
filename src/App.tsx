import{useEffect,useMemo,useRef,useState}from'react';
import{db}from'./db';
import{seedBundledContent}from'./seed';
import{buildTodayQueue,dayNumber,schedule,type Card,type Deck,type Project,type Rating,type ReviewLog,type ReviewState}from'./core';

type View='home'|'decks'|'review'|'progress';
const labels:Record<Rating,string>={again:'不认识',hard:'眼熟',good:'认识'};
const marks:Record<Rating,string>={again:'×',hard:'△',good:'○'};
const SWIPE_DX=40,SWIPE_DY=60,EDGE_X=24,EDGE_DX=50;

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

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

  const cardRef=useRef<HTMLElement|null>(null);
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
    setView('home');
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

  if(view==='review'&&current){
    return <main className="review-shell">
      <header className="review-header">
        <button className="ghost" onClick={()=>setView('home')}>← 返回</button>
        <div className="review-meta">
          <span>{round===1?'第 1 遍':'错题复习'}</span>
          <strong>{position+1} / {queue.length}</strong>
        </div>
      </header>

      <div className="review-stage">
        <div className="card-holder">
          <section
            ref={cardRef}
            className={'study-card '+(flipped?'flipped ':'')+(locked?'locked':'')}
            aria-pressed={flipped}
            onClick={toggleFlip}
            onTouchStart={e=>{
              if(locked){swipeStart.current=null;return;}
              const t=e.touches[0];
              swipeStart.current={x:t.clientX,y:t.clientY};
            }}
            onTouchEnd={e=>{
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
            <div className="card-face front">
              <div className="card-kicker">{current.tags.join(' · ')||'FLASHCARD'}</div>
              <div className="card-main"><h1>{current.front}</h1></div>
              <div className="card-foot">轻点翻面 · 左滑不认识 · 右滑认识 · 下滑眼熟</div>
            </div>

            <div className="card-face back">
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

      <div className="rating-row">
        {(['again','hard','good']as Rating[]).map((rating,i)=>
          <button key={rating} disabled={!flipped||locked} onClick={()=>void rate(rating)}>
            <b>{marks[rating]}</b><span>{labels[rating]}</span><kbd>{i+1}</kbd>
          </button>
        )}
      </div>
    </main>;
  }

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={()=>setView('home')}>
        <DotMark/><strong>MEMO</strong>
      </button>
      <nav>
        <button className={view==='decks'?'active':''} onClick={()=>setView('decks')}>Decks</button>
        <button className={view==='progress'?'active':''} onClick={()=>setView('progress')}>Progress</button>
      </nav>
    </header>

    {view==='home'&&<>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">MEMORY / REVIEW / TRACE</p>
          <h1>FLASHCARDS</h1>
          <p className="hero-cn">{activeProject?.name??'记忆 · 复习 · 追踪'}</p>
          <p className="hero-note">{activeProject?.description??'把每天真正需要记住的东西，留在一张安静的卡片上。'}</p>
          <button className="cta" disabled={!todayQueue.length} onClick={()=>void startToday()}>
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
        <div className="section-title"><strong>我的项目</strong><button onClick={()=>setView('decks')}>查看当前项目卡组 →</button></div>
        <div className="project-grid">
          {projects.map(project=><ProjectTile
            key={project.id}
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
    </>}

    {view==='decks'&&<section className="page-section">
      <div className="page-project-row">
        <button className="project-trigger inline" onClick={()=>setProjectMenuOpen(v=>!v)}>
          <DotMark compact/><span><small>PROJECT</small><strong>{activeProject?.name??'选择项目'}</strong></span><b>⌄</b>
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
        {activeDecks.map(deck=><DeckRow key={deck.id} deck={deck} cards={cards} states={stateMap} today={today} onOpen={()=>void startDeck(deck.id)}/>)}
      </div>
    </section>}

    {view==='progress'&&<section className="page-section">
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
        <span>{project.name}<small>{project.description}</small></span><strong>{q.length}</strong>
      </button>;
    })}
  </div>;
}

function ProjectTile({project,active,decks,cards,states,today,onChoose}:{
  project:Project;active:boolean;decks:Deck[];cards:Card[];states:Map<string,ReviewState>;today:number;onChoose:()=>void
}){
  const deckIds=new Set(decks.filter(d=>d.projectId===project.id).map(d=>d.id));
  const list=cards.filter(c=>deckIds.has(c.deckId));
  const due=buildTodayQueue(list,states,today).length;
  return <button className={'project-tile '+(active?'active':'')} onClick={onChoose}>
    <ProjectSwatch projectId={project.id}/>
    <div><small>{active?'DAILY PROJECT':'PROJECT'}</small><h3>{project.name}</h3><p>{deckIds.size} 个卡组 · {list.length} 张卡</p></div>
    <div className="project-due"><strong>{due}</strong><span>今日</span></div>
  </button>;
}

function ProjectSwatch({projectId}:{projectId:string}){
  const variant=projectId==='cet6'?'streak':'smear';
  return <span className={'project-swatch '+variant} aria-hidden="true"><i/><b/></span>;
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

function DeckRow({deck,cards,states,today,onOpen}:{deck:Deck;cards:Card[];states:Map<string,ReviewState>;today:number;onOpen:()=>void}){
  const s=deckSummary(deck.id,cards,states,today);
  return <button className="deck-row" onClick={onOpen}>
    <div><h3>{deck.name}</h3><p>{deck.description}</p></div>
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
