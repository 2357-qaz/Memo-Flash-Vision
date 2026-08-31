import{describe,expect,it}from'vitest';
import{dayNumber,freshState,schedule}from'./core';

describe('scheduler',()=>{
  const now=Date.UTC(2026,7,31,12),today=dayNumber(now);

  it('fresh good -> 3d',()=>{
    const x=schedule(undefined,'c1','good',now);
    expect(x.intervalDays).toBe(3);
    expect(x.dueDay).toBe(today+3);
  });

  it('again stays due today',()=>{
    const x=schedule(freshState('c1',today),'c1','again',now);
    expect(x.intervalDays).toBe(0);
    expect(x.dueDay).toBe(today);
    expect(x.lapses).toBe(1);
  });

  it('reviewed good grows interval',()=>{
    const x=schedule({cardId:'c1',intervalDays:4,dueDay:today,lapses:1,reviewCount:3},'c1','good',now);
    expect(x.intervalDays).toBe(10);
    expect(x.lapses).toBe(0);
  });

  it('same-session review round follows Fangge intervals',()=>{
    const previous={cardId:'c1',intervalDays:0,dueDay:today,lapses:1,reviewCount:1};
    expect(schedule(previous,'c1','good',now,true).intervalDays).toBe(2);
    expect(schedule(previous,'c1','hard',now,true).intervalDays).toBe(1);
  });
});
