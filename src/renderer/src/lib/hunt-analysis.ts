import catalog from '../data/game-catalog.json'
import type { HuntSession, Pokemon } from '../../../shared/types'

type Attack={name:string;power:number;type:string;category:string;cooldownMs:number;learnLevel:number}
type Drop={name:string;chance:number;minCount:number;maxCount:number}
export type HuntEntry={id:number;name:string;type1:string;type2:string|null;baseHp:number;baseAttack:number;baseDefense:number;baseSpecialAttack:number;baseSpecialDefense:number;baseSpeed:number;huntLevel:number;experience:number;attacks:Attack[];loot?:Drop[];huntVariant?:boolean}
export type EstimateConfidence='measured'|'calibrated'|'theoretical'
export type HuntRecommendation={hunt:HuntEntry;offense:number;defense:number;bestMove:string;bestMoveType:string;multiplier:number;score:number;estimatedKillSeconds:number;estimatedKillsPerHour:number;estimatedXpPerHour:number;estimatedLootPerHour:number;expectedLootPerKill:number;risk:number;confidence:EstimateConfidence;measuredKillsPerHour?:number;measuredXpPerHour?:number}
const creatures=catalog.creatures as HuntEntry[]
const items=(catalog as {items?:Array<{name:string;npcPrice?:number}>}).items??[]
const itemPrices=new Map(items.map(item=>[normalizeName(item.name),Number(item.npcPrice??0)]))
const chart:Record<string,string[]>={NORMAL:[],FIRE:['GRASS','ICE','BUG','STEEL'],WATER:['FIRE','GROUND','ROCK'],ELECTRIC:['WATER','FLYING'],GRASS:['WATER','GROUND','ROCK'],ICE:['GRASS','GROUND','FLYING','DRAGON'],FIGHTING:['NORMAL','ICE','ROCK','DARK','STEEL'],POISON:['GRASS','FAIRY'],GROUND:['FIRE','ELECTRIC','POISON','ROCK','STEEL'],FLYING:['GRASS','FIGHTING','BUG'],PSYCHIC:['FIGHTING','POISON'],BUG:['GRASS','PSYCHIC','DARK'],ROCK:['FIRE','ICE','FLYING','BUG'],GHOST:['PSYCHIC','GHOST'],DRAGON:['DRAGON'],DARK:['PSYCHIC','GHOST'],STEEL:['ICE','ROCK','FAIRY'],FAIRY:['FIGHTING','DRAGON','DARK']}
const resisted:Record<string,string[]>={FIRE:['FIRE','WATER','ROCK','DRAGON'],WATER:['WATER','GRASS','DRAGON'],ELECTRIC:['ELECTRIC','GRASS','DRAGON'],GRASS:['FIRE','GRASS','POISON','FLYING','BUG','DRAGON','STEEL'],ICE:['FIRE','WATER','ICE','STEEL'],FIGHTING:['POISON','FLYING','PSYCHIC','BUG','FAIRY'],POISON:['POISON','GROUND','ROCK','GHOST'],GROUND:['GRASS','BUG'],FLYING:['ELECTRIC','ROCK','STEEL'],PSYCHIC:['PSYCHIC','STEEL'],BUG:['FIRE','FIGHTING','POISON','FLYING','GHOST','STEEL','FAIRY'],ROCK:['FIGHTING','GROUND','STEEL'],GHOST:['DARK'],DRAGON:['STEEL'],DARK:['FIGHTING','DARK','FAIRY'],STEEL:['FIRE','WATER','ELECTRIC','STEEL'],FAIRY:['FIRE','POISON','STEEL']}
const immune:Record<string,string[]>={NORMAL:['GHOST'],FIGHTING:['GHOST'],POISON:['STEEL'],GROUND:['FLYING'],ELECTRIC:['GROUND'],PSYCHIC:['DARK'],GHOST:['NORMAL'],DRAGON:['FAIRY']}
function normalizeName(value:string):string{return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'')}
function hours(session:HuntSession):number{return Math.max(1/3600,(session.observedDurationMs??Math.max(1000,new Date(session.endedAt??session.updatedAt).getTime()-new Date(session.startedAt).getTime()))/3_600_000)}
export function baseMultiplier(attack:string,defenses:string[]):number{return defenses.reduce((m,d)=>immune[attack]?.includes(d)?0:m*(chart[attack]?.includes(d)?2:resisted[attack]?.includes(d)?.5:1),1)}
export function huntMultiplier(attack:string,defenses:string[]):number{const m=baseMultiplier(attack,defenses);if(m===4)return 5.5;if(m===2)return 2.5;if(m===.5)return .33;if(m===.25)return .22;return m}
function ownCreature(pokemon:Pokemon):HuntEntry|undefined{return creatures.find(c=>c.id===pokemon.speciesId)||creatures.find(c=>normalizeName(c.name)===normalizeName(pokemon.species))}
function statAt(base:number,level:number,quality=1):number{return Math.max(1,Math.round(base*Math.max(1,level)/100*Math.pow(Math.max(.5,quality),1.15)))}
function expectedLoot(hunt:HuntEntry):number{return (hunt.loot??[]).reduce((sum,drop)=>{const probability=Math.max(0,Math.min(1,Number(drop.chance??0)/100000));const quantity=(Number(drop.minCount??1)+Number(drop.maxCount??1))/2;return sum+probability*quantity*(itemPrices.get(normalizeName(drop.name))??0)},0)}
function measuredFor(sessions:HuntSession[],pokemon:Pokemon,hunt:HuntEntry):{killsPerHour:number;xpPerHour:number;duration:number}|undefined{let kills=0,xp=0,duration=0;for(const session of sessions){if(!session.kills||normalizeName(session.pokemonName??'')!==normalizeName(pokemon.species)||normalizeName(session.huntName)!==normalizeName(hunt.name))continue;const h=hours(session);kills+=session.kills;xp+=session.xp;duration+=h}return duration>0?{killsPerHour:kills/duration,xpPerHour:xp/duration,duration}:undefined}
export function recommendHunts(pokemon:Pokemon,maxLevel=999,sessions:HuntSession[]=[]):HuntRecommendation[]{const own=ownCreature(pokemon);if(!own)return[];const ownLevel=Math.max(1,Number(pokemon.level||1));const quality=Math.max(.5,Number(String(pokemon.quality??'1').replace(',','.'))||1);const learned=(own.attacks||[]).filter((a):a is Attack=>Boolean(a)&&a.learnLevel<=ownLevel&&a.power>0);const moves=learned.length?learned:[{name:own.type1,power:1,type:own.type1,category:'SPECIAL',cooldownMs:1000,learnLevel:1}];const ownAtk=pokemon.stats?.attack??statAt(own.baseAttack,ownLevel,quality);const ownSpAtk=pokemon.stats?.specialAttack??statAt(own.baseSpecialAttack,ownLevel,quality);const ownDef=pokemon.stats?.defense??statAt(own.baseDefense,ownLevel,quality);const ownSpDef=pokemon.stats?.specialDefense??statAt(own.baseSpecialDefense,ownLevel,quality);return creatures.filter(h=>h.huntLevel>0&&h.huntLevel<=maxLevel).map(h=>{const target=[h.type1,h.type2].filter(Boolean) as string[];const ranked=moves.map(a=>{const mult=huntMultiplier(a.type,target);const stab=a.type===own.type1||a.type===own.type2?1.5:1;const attackStat=a.category==='SPECIAL'?ownSpAtk:ownAtk;return{a,mult,value:(a.power/Math.max(1000,a.cooldownMs))*mult*stab*Math.max(1,attackStat)}}).sort((a,b)=>b.value-a.value)[0];const ownTypes=[own.type1,own.type2].filter(Boolean) as string[];const enemyMoves=(h.attacks??[]).filter((a):a is Attack=>Boolean(a)&&a.learnLevel<=h.huntLevel&&a.power>0);const enemyPressure=Math.max(1,...enemyMoves.map(a=>huntMultiplier(a.type,ownTypes)*(a.power/Math.max(1000,a.cooldownMs))*(a.category==='SPECIAL'?h.baseSpecialAttack:h.baseAttack)));const defense=Math.max(1,...[h.type1,h.type2].filter(Boolean).map(t=>huntMultiplier(t as string,ownTypes)));const targetHp=statAt(h.baseHp,h.huntLevel)*5;const targetDefense=statAt(ranked.a.category==='SPECIAL'?h.baseSpecialDefense:h.baseDefense,h.huntLevel);const durability=targetHp*(1+targetDefense/Math.max(25,targetHp));const rawSeconds=durability/Math.max(.1,ranked.value)*7.5;const estimatedKillSeconds=Math.max(1.5,Math.min(600,rawSeconds+1.2));let estimatedKillsPerHour=3600/estimatedKillSeconds;let confidence:EstimateConfidence='theoretical';const exact=measuredFor(sessions,pokemon,h);if(exact){estimatedKillsPerHour=exact.killsPerHour;confidence='measured'}else{const references=sessions.filter(s=>s.kills>0&&normalizeName(s.pokemonName??'')===normalizeName(pokemon.species));if(references.length){const totalHours=references.reduce((sum,s)=>sum+hours(s),0);const observedKph=references.reduce((sum,s)=>sum+s.kills,0)/Math.max(1/3600,totalHours);estimatedKillsPerHour=Math.max(1,Math.min(estimatedKillsPerHour*2.5,estimatedKillsPerHour*.45+observedKph*.55));confidence='calibrated'}}const expectedLootPerKill=expectedLoot(h);const estimatedXpPerHour=estimatedKillsPerHour*h.experience;const estimatedLootPerHour=estimatedKillsPerHour*expectedLootPerKill;const risk=Math.max(.05,enemyPressure/Math.max(1,(ownDef+ownSpDef)/2)*1.8);const offense=ranked.value;const score=estimatedXpPerHour/(1+Math.max(0,risk-1)*.3);return{hunt:h,offense,defense,bestMove:ranked.a.name,bestMoveType:ranked.a.type,multiplier:ranked.mult,score,estimatedKillSeconds,estimatedKillsPerHour,estimatedXpPerHour,estimatedLootPerHour,expectedLootPerKill,risk,confidence,measuredKillsPerHour:exact?.killsPerHour,measuredXpPerHour:exact?.xpPerHour}}).sort((a,b)=>b.score-a.score)}
export function creatureTypes(pokemon:Pokemon):string[]{const own=ownCreature(pokemon);return own?[own.type1,own.type2].filter(Boolean) as string[]:[]}

export function recommendHuntsCalibrated(pokemon:Pokemon,maxLevel=999,sessions:HuntSession[]=[]):HuntRecommendation[]{
  const trusted=sessions.filter(session=>session.identityConfidence==='confirmed'&&session.kills>0)
  const theoretical=recommendHunts(pokemon,maxLevel,[])
  if(!trusted.length)return theoretical
  const theoryByHunt=new Map(theoretical.map(entry=>[normalizeName(entry.hunt.name),entry]))
  const samePokemon=trusted.filter(session=>normalizeName(session.pokemonName??'')===normalizeName(pokemon.species))
  return theoretical.map(entry=>{
    const exact=samePokemon.filter(session=>normalizeName(session.huntName)===normalizeName(entry.hunt.name))
    const exactHours=exact.reduce((sum,session)=>sum+hours(session),0)
    let killsPerHour=entry.estimatedKillsPerHour
    let confidence:EstimateConfidence='theoretical'
    if(exactHours>0){
      const observed=exact.reduce((sum,session)=>sum+session.kills,0)/exactHours
      const weight=Math.max(.25,Math.min(1,exactHours/.5))
      killsPerHour=killsPerHour*(1-weight)+observed*weight
      confidence=exactHours>=.5?'measured':'calibrated'
    }else if(samePokemon.length){
      let weightedRatio=0,totalWeight=0
      for(const session of samePokemon){
        const reference=theoryByHunt.get(normalizeName(session.huntName));if(!reference)continue
        const duration=hours(session),observed=session.kills/duration
        weightedRatio+=Math.max(.5,Math.min(3,observed/Math.max(1,reference.estimatedKillsPerHour)))*duration
        totalWeight+=duration
      }
      if(totalWeight>0){
        const ratio=weightedRatio/totalWeight,weight=Math.min(.8,totalWeight/1.5)
        killsPerHour=killsPerHour*(1-weight)+killsPerHour*ratio*weight
        confidence='calibrated'
      }
    }
    killsPerHour=Math.max(1,Math.min(1200,killsPerHour))
    return{...entry,estimatedKillsPerHour:killsPerHour,estimatedKillSeconds:3600/killsPerHour,estimatedXpPerHour:killsPerHour*entry.hunt.experience,estimatedLootPerHour:killsPerHour*entry.expectedLootPerKill,score:(killsPerHour*entry.hunt.experience)/(1+Math.max(0,entry.risk-1)*.3),confidence,measuredKillsPerHour:confidence==='measured'?killsPerHour:undefined,measuredXpPerHour:confidence==='measured'?killsPerHour*entry.hunt.experience:undefined}
  }).sort((a,b)=>b.score-a.score)
}
