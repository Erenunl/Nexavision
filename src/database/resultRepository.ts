import { getDatabase } from "./connection.js";
import type { ResultBallotSnapshot, ResultSession, ResultStatus } from "../types/result.js";
import type { VoteBallot } from "../types/vote.js";

interface SessionRow { id:number; guild_id:string; status:ResultStatus; reveal_order_json:string; current_voting_country_index:number; reveal_mode:string; created_at:string; started_at:string|null; finished_at:string|null }
function shuffle<T>(items:T[]):T[]{ const value=[...items]; for(let i=value.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [value[i],value[j]]=[value[j]!,value[i]!];} return value; }

export class ResultRepository {
  findCurrent(guildId:string):ResultSession|null {
    const db=getDatabase();
    const row=db.prepare("SELECT * FROM result_sessions WHERE guild_id=? ORDER BY id DESC LIMIT 1").get(guildId) as SessionRow|undefined;
    if(!row) return null;
    const ballots=(db.prepare("SELECT voter_country_code, entries_json FROM result_snapshot_ballots WHERE session_id=?").all(row.id) as Array<{voter_country_code:string;entries_json:string}>).map(r=>({voterCountryCode:r.voter_country_code,entries:JSON.parse(r.entries_json)} as ResultBallotSnapshot));
    const targetCountries=(db.prepare('SELECT country_code FROM result_snapshot_targets WHERE session_id=? ORDER BY country_code').all(row.id) as Array<{country_code:string}>).map(r=>r.country_code);return {id:row.id,guildId:row.guild_id,status:row.status,revealOrder:JSON.parse(row.reveal_order_json),currentIndex:row.current_voting_country_index,revealMode:row.reveal_mode,createdAt:row.created_at,startedAt:row.started_at,finishedAt:row.finished_at,ballots,targetCountries};
  }
  prepare(guildId:string, ballots:VoteBallot[], targetCountries:string[]=[]):ResultSession {
    const db=getDatabase(); return db.transaction(()=>{
      const active=db.prepare("SELECT 1 FROM result_sessions WHERE guild_id=? AND status IN ('PREPARED','RUNNING','PAUSED')").get(guildId); if(active) throw new Error("ACTIVE_RESULT_SESSION");
      const order=shuffle(ballots.map(b=>b.voterCountryCode)); const now=new Date().toISOString();
      const result=db.prepare("INSERT INTO result_sessions(guild_id,status,reveal_order_json,created_at) VALUES(?,'PREPARED',?,?)").run(guildId,JSON.stringify(order),now); const id=Number(result.lastInsertRowid);
      const insert=db.prepare("INSERT INTO result_snapshot_ballots(session_id,voter_country_code,entries_json) VALUES(?,?,?)");
      for(const ballot of ballots) insert.run(id,ballot.voterCountryCode,JSON.stringify(ballot.entries));
      const insertTarget=db.prepare('INSERT INTO result_snapshot_targets(session_id,country_code) VALUES(?,?)');for(const code of targetCountries)insertTarget.run(id,code);
      return this.findCurrent(guildId)!;
    })();
  }
  transition(guildId:string, from:ResultStatus, to:ResultStatus):boolean { const now=new Date().toISOString(); const extra=to==='RUNNING'&&from==='PREPARED'?', started_at=?':to==='FINISHED'?', finished_at=?':''; const args=extra?[to,now,guildId,from]:[to,guildId,from]; return getDatabase().prepare(`UPDATE result_sessions SET status=?${extra} WHERE guild_id=? AND status=?`).run(...args).changes===1; }
  next(guildId:string):{session:ResultSession;ballot:ResultBallotSnapshot;finished:boolean}|null { const db=getDatabase(); return db.transaction(()=>{ const s=this.findCurrent(guildId); if(!s||s.status!=='RUNNING'||s.currentIndex>=s.revealOrder.length)return null; const code=s.revealOrder[s.currentIndex]!; const ballot=s.ballots.find(b=>b.voterCountryCode===code)!; const next=s.currentIndex+1; const finished=next>=s.revealOrder.length; db.prepare("UPDATE result_sessions SET current_voting_country_index=?, status=?, finished_at=? WHERE id=? AND current_voting_country_index=? AND status='RUNNING'").run(next,finished?'FINISHED':'RUNNING',finished?new Date().toISOString():null,s.id,s.currentIndex); return {session:this.findCurrent(guildId)!,ballot,finished}; })(); }
}
