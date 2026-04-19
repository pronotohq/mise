'use client'
import { useState } from 'react'

const STEPS = [
  { id: 0, label: 'splash' },
  { id: 1, label: 'setup',   color: 'var(--fn-step-1)', prog: '20%'  },
  { id: 2, label: 'dietary', color: 'var(--fn-step-2)', prog: '40%'  },
  { id: 3, label: 'cuisine', color: 'var(--fn-step-3)', prog: '60%'  },
  { id: 4, label: 'fridge',  color: 'var(--fn-step-4)', prog: '80%'  },
  { id: 5, label: 'notifs',  color: 'var(--fn-step-5)', prog: '100%' },
  { id: 6, label: 'done' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [kidName, setKidName] = useState('')
  const [household, setHousehold] = useState(2)
  const [child, setChild] = useState<'none' | 'toddler' | 'kid'>('none')
  const [diet, setDiet] = useState<string[]>([])
  const [cuisine, setCuisine] = useState<string[]>([])
  const [fridgeMethod, setFridgeMethod] = useState('voice')
  const [notifOn, setNotifOn] = useState(true)
  const [nudgeTimes, setNudgeTimes] = useState(['morning', 'evening'])
  const [voted, setVoted] = useState(false)

  const goTo = (n: number) => setStep(n)
  const toggleArr = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  /* ── SPLASH ── */
  if (step === 0) return (
    <div style={{
      background: 'linear-gradient(160deg,#C8724E 0%,#9A4828 55%,#6E2E12 100%)',
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '48px 36px',
      position: 'relative', overflow: 'hidden', flexDirection: 'column',
    }}>
      <div style={{position:'absolute',width:380,height:380,borderRadius:'50%',
        background:'rgba(255,255,255,.06)',top:-110,right:-110,pointerEvents:'none'}} />
      <div style={{position:'absolute',width:260,height:260,borderRadius:'50%',
        background:'rgba(255,255,255,.04)',bottom:-50,left:-70,pointerEvents:'none'}} />
      <div style={{position:'relative',zIndex:1,width:'100%',maxWidth:340}}>
        <div style={{width:84,height:84,background:'rgba(255,255,255,.18)',borderRadius:22,
          margin:'0 auto 28px',display:'flex',alignItems:'center',justifyContent:'center',
          border:'1.5px solid rgba(255,255,255,.3)',
          animation:'fn-float 3.5s ease-in-out infinite'}}>
          <span style={{fontSize:42}}>🧊</span>
        </div>
        <h1 style={{fontFamily:'var(--fn-font-display)',fontSize:50,fontWeight:900,color:'white',
          lineHeight:.95,letterSpacing:'-.025em',marginBottom:14}}>
          Fresh<em style={{fontStyle:'italic',color:'rgba(255,230,180,.9)'}}>Nudge</em>
        </h1>
        <p style={{fontSize:15,color:'rgba(255,255,255,.75)',fontWeight:600,lineHeight:1.6,marginBottom:10}}>
          Your kitchen, on autopilot.<br />Never wonder what to cook again.
        </p>
        <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.13)',
          borderRadius:99,padding:'6px 14px',fontSize:11,color:'rgba(255,255,255,.7)',
          fontWeight:700,marginBottom:44}}>
          🔒 Works offline · Your data stays on your device
        </div>
        <button onClick={() => goTo(1)} style={{width:'100%',padding:18,background:'white',
          color:'var(--fn-terra-dark)',border:'none',borderRadius:14,fontFamily:'var(--fn-font-body)',
          fontSize:16,fontWeight:900,cursor:'pointer',boxShadow:'0 8px 30px rgba(0,0,0,.22)'}}>
          Get started →
        </button>
      </div>
      <style>{`@keyframes fn-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}`}</style>
    </div>
  )

  /* ── DONE ── */
  if (step === 6) return (
    <div style={{background:'linear-gradient(160deg,#C8724E 0%,#9A4828 55%,#6E2E12 100%)',
      minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      textAlign:'center',padding:'48px 36px',flexDirection:'column',
      position:'relative',overflow:'hidden'}}>
      <div style={{position:'relative',zIndex:1,width:'100%',maxWidth:340}}>
        <div style={{width:96,height:96,background:'white',borderRadius:'50%',
          display:'flex',alignItems:'center',justifyContent:'center',
          margin:'0 auto 28px',boxShadow:'0 12px 40px rgba(0,0,0,.18)',
          animation:'fn-pop .55s cubic-bezier(.34,1.56,.64,1) both'}}>
          <span style={{fontSize:46}}>🎉</span>
        </div>
        <h2 style={{fontFamily:'var(--fn-font-display)',fontSize:38,fontWeight:900,color:'white',
          lineHeight:1.1,letterSpacing:'-.02em',marginBottom:12}}>
          Your kitchen<br />is ready!
        </h2>
        <p style={{fontSize:15,color:'rgba(255,255,255,.8)',fontWeight:600,lineHeight:1.65,marginBottom:44}}>
          Welcome, <strong style={{color:'white'}}>{name || 'friend'}</strong>.<br />
          Let&apos;s start cooking smarter and wasting less.
        </p>
        <button style={{width:'100%',padding:17,background:'white',color:'var(--fn-terra-dark)',
          border:'none',borderRadius:14,fontFamily:'var(--fn-font-body)',fontSize:16,
          fontWeight:900,cursor:'pointer',boxShadow:'0 8px 28px rgba(0,0,0,.2)'}}>
          Open FreshNudge 🍳
        </button>
      </div>
      <style>{`@keyframes fn-pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  /* ── ONBOARDING STEPS 1–5 ── */
  const s = STEPS[step]
  const accentColor = s.color!

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:'var(--fn-cream)'}}>

      {/* ── COLOURED TOP BAND ── */}
      <div style={{background:accentColor,position:'relative',overflow:'hidden',flexShrink:0}}>
        <div style={{position:'absolute',width:220,height:220,borderRadius:'50%',
          background:'rgba(255,255,255,.1)',top:-60,right:-50,pointerEvents:'none'}} />
        <div style={{position:'absolute',width:130,height:130,borderRadius:'50%',
          background:'rgba(255,255,255,.08)',bottom:10,left:-20,pointerEvents:'none'}} />

        {/* nav row */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'52px 24px 14px',position:'relative',zIndex:2}}>
          <button onClick={() => goTo(step - 1)} style={{width:32,height:32,borderRadius:'50%',
            background:'rgba(255,255,255,.22)',border:'none',color:'white',fontSize:15,
            cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            ←
          </button>
          <div style={{display:'flex',gap:5}}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{height:6,borderRadius:99,
                background: i === step ? 'white' : 'rgba(255,255,255,.35)',
                width: i === step ? 18 : 6,
                transition:'all .3s'}} />
            ))}
          </div>
          <div style={{width:32,fontSize:12,fontWeight:800,color:'rgba(255,255,255,.7)',textAlign:'right'}}>
            {step} of 5
          </div>
        </div>

        {/* headline */}
        <div style={{textAlign:'center',padding:'0 28px 20px',position:'relative',zIndex:2}}>
          <div style={{fontFamily:'var(--fn-font-display)',fontSize:30,fontWeight:900,
            color:'white',lineHeight:1.1,letterSpacing:'-.01em'}}>
            {step === 1 && <><span>Set the table.</span><br /><em>Tell us about your home.</em></>}
            {step === 2 && <><span>Any dietary</span><br /><em>preferences?</em></>}
            {step === 3 && <><span>What do you</span><br /><em>usually eat?</em></>}
            {step === 4 && <><span>How do you want to</span><br /><em>update your fridge?</em></>}
            {step === 5 && <><span>When should we</span><br /><em>nudge you?</em></>}
          </div>
        </div>
      </div>

      {/* ── WHITE CARD ── */}
      <div style={{flex:1,background:'white',borderRadius:'26px 26px 0 0',
        overflowY:'auto',marginTop:-2,boxShadow:'0 -4px 20px rgba(28,16,8,.08)'}}>
        <div style={{padding:'24px 22px 100px'}}>

          {/* progress bar */}
          <div style={{height:3,background:'var(--fn-linen)',borderRadius:99,marginBottom:22,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:99,background:accentColor,
              width:s.prog,transition:'width .4s'}} />
          </div>

          {/* ── STEP 1: Setup ── */}
          {step === 1 && (
            <div>
              <p style={{fontSize:14,color:'var(--fn-ink-3)',fontWeight:600,lineHeight:1.55,marginBottom:20}}>
                Tell us a little about your home so we can personalise everything.
              </p>

              <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:8,display:'block'}}>
                What should we call you?
              </label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Your first name"
                style={{width:'100%',background:'var(--fn-cream)',border:'2px solid var(--fn-line)',
                  borderRadius:14,padding:'14px 16px',fontFamily:'var(--fn-font-body)',fontSize:17,
                  fontWeight:700,color:'var(--fn-ink)',outline:'none',marginBottom:16}} />

              <div style={{height:1,background:'var(--fn-line)',margin:'4px 0 16px'}} />

              <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:8,display:'block'}}>
                How many are you cooking for?
              </label>
              <div style={{display:'flex',gap:7,marginBottom:16}}>
                {[1,2,3,4,'5+'].map(n => {
                  const active = n === '5+' ? household >= 5 : household === Number(n)
                  return (
                    <button key={String(n)} onClick={() => setHousehold(n === '5+' ? 5 : Number(n))}
                      style={{flex:1,padding:'14px 4px',borderRadius:14,fontFamily:'var(--fn-font-body)',
                        fontSize:17,fontWeight:800,cursor:'pointer',border:'2px solid',textAlign:'center',
                        transition:'all .15s',
                        background: active ? accentColor : 'var(--fn-cream)',
                        borderColor: active ? accentColor : 'var(--fn-line)',
                        color: active ? 'white' : 'var(--fn-ink-3)'}}>
                      {n}
                    </button>
                  )
                })}
              </div>

              <div style={{height:1,background:'var(--fn-line)',margin:'4px 0 16px'}} />

              <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:8,display:'block'}}>
                Any little ones at the table?
              </label>
              <p style={{fontSize:13,color:'var(--fn-ink-3)',fontWeight:600,marginBottom:10}}>
                We&apos;ll adjust meal safety, spice, and serving style automatically.
              </p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                {([
                  {id:'none',    icon:'🚫', label:'No child'},
                  {id:'toddler', icon:'🍼', label:'Toddler'},
                  {id:'kid',     icon:'🧒', label:'Kid 5+'},
                ] as {id:'none'|'toddler'|'kid'; icon:string; label:string}[]).map(c => (
                  <div key={c.id} onClick={() => setChild(c.id)}
                    style={{padding:'13px 6px 10px',borderRadius:14,textAlign:'center',cursor:'pointer',
                      border:'2px solid',transition:'all .15s',
                      background: child === c.id ? accentColor : 'var(--fn-cream)',
                      borderColor: child === c.id ? accentColor : 'var(--fn-line)'}}>
                    <span style={{fontSize:24,display:'block',marginBottom:4}}>{c.icon}</span>
                    <span style={{fontSize:11,fontWeight:800,
                      color: child === c.id ? 'white' : 'var(--fn-ink-3)'}}>
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
              {(child === 'toddler' || child === 'kid') && (
                <div>
                  <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:8,display:'block'}}>
                    What&apos;s their name?
                  </label>
                  <input value={kidName} onChange={e => setKidName(e.target.value)}
                    placeholder="e.g. Avya"
                    style={{width:'100%',background:'var(--fn-cream)',border:'2px solid var(--fn-line)',
                      borderRadius:14,padding:'14px 16px',fontFamily:'var(--fn-font-body)',fontSize:17,
                      fontWeight:700,color:'var(--fn-ink)',outline:'none'}} />
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Dietary ── */}
          {step === 2 && (
            <div>
              <p style={{fontSize:14,color:'var(--fn-ink-3)',fontWeight:600,lineHeight:1.55,marginBottom:20}}>
                Select all that apply — we&apos;ll filter recipes accordingly.
              </p>
              <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
                {[
                  '🥗 Vegetarian','🌱 Vegan','🌾 Gluten-free','🥛 Dairy-free',
                  '🥜 Nut allergy','☪️ Halal','✡️ Kosher','🍚 Low-carb',
                  '🐟 Pescatarian','🫀 Diabetic-friendly',
                ].map(d => (
                  <button key={d} onClick={() => setDiet(toggleArr(diet, d))}
                    style={{padding:'9px 14px',borderRadius:99,fontFamily:'var(--fn-font-body)',
                      fontSize:13,fontWeight:700,cursor:'pointer',border:'2px solid',transition:'all .15s',
                      background: diet.includes(d) ? accentColor : 'var(--fn-cream)',
                      borderColor: diet.includes(d) ? accentColor : 'var(--fn-line)',
                      color: diet.includes(d) ? 'white' : 'var(--fn-ink-2)'}}>
                    {d}
                  </button>
                ))}
              </div>
              <p style={{fontSize:12,color:'var(--fn-ink-3)',fontWeight:600,textAlign:'center',marginTop:12}}>
                Select as many as you like — even 1 is enough
              </p>
            </div>
          )}

          {/* ── STEP 3: Cuisine ── */}
          {step === 3 && (
            <div>
              <p style={{fontSize:14,color:'var(--fn-ink-3)',fontWeight:600,lineHeight:1.55,marginBottom:20}}>
                Pick all that apply — your meal suggestions will match your actual eating style.
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:9}}>
                {[
                  {id:'indian',  icon:'🇮🇳', title:'Indian everyday',          desc:'Dal, sabzi, roti, chawal, khichdi, poha, upma'},
                  {id:'asian',   icon:'🍜',   title:'Asian',                    desc:'Stir fry, fried rice, noodles, curry, dim sum'},
                  {id:'western', icon:'🍝',   title:'Western / Continental',    desc:'Pasta, sandwiches, salads, grilled food'},
                  {id:'mexican', icon:'🌮',   title:'Mexican / Middle Eastern', desc:'Wraps, tacos, hummus, kebabs'},
                  {id:'med',     icon:'🥗',   title:'Mediterranean',            desc:'Grain bowls, roasted veggies, fish, olive oil'},
                ].map(c => (
                  <div key={c.id} onClick={() => setCuisine(toggleArr(cuisine, c.id))}
                    style={{display:'flex',alignItems:'center',gap:12,padding:13,borderRadius:16,
                      cursor:'pointer',border:'2px solid',transition:'all .16s',
                      background: cuisine.includes(c.id) ? 'var(--fn-terra-wash)' : 'var(--fn-cream)',
                      borderColor: cuisine.includes(c.id) ? accentColor : 'var(--fn-line)'}}>
                    <div style={{width:40,height:40,borderRadius:11,
                      background: cuisine.includes(c.id) ? 'var(--fn-terra-soft)' : 'var(--fn-linen)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                      {c.icon}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,marginBottom:2,
                        color: cuisine.includes(c.id) ? 'var(--fn-terra-dark)' : 'var(--fn-ink)'}}>
                        {c.title}
                      </div>
                      <div style={{fontSize:12,color:'var(--fn-ink-3)',fontWeight:600}}>{c.desc}</div>
                    </div>
                    {cuisine.includes(c.id) && (
                      <div style={{width:21,height:21,background:'var(--fn-terra)',borderRadius:'50%',
                        color:'white',fontSize:11,fontWeight:900,display:'flex',
                        alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        ✓
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Fridge method ── */}
          {step === 4 && (
            <div>
              <p style={{fontSize:14,color:'var(--fn-ink-3)',fontWeight:600,lineHeight:1.55,marginBottom:20}}>
                Pick what works for you — you can always change later.
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:9}}>
                {[
                  {id:'photo', icon:'📸', title:'Photo my fridge', desc:'Snap one photo of your open fridge — AI finds everything'},
                  {id:'voice', icon:'🎤', title:'Voice',           desc:'Say "2 mangoes, 400g curd, 1L milk" — done'},
                ].map(m => (
                  <div key={m.id} onClick={() => setFridgeMethod(m.id)}
                    style={{display:'flex',alignItems:'center',gap:12,padding:13,borderRadius:16,
                      cursor:'pointer',border:'2px solid',transition:'all .16s',
                      background: fridgeMethod === m.id ? 'var(--fn-terra-wash)' : 'var(--fn-cream)',
                      borderColor: fridgeMethod === m.id ? accentColor : 'var(--fn-line)'}}>
                    <div style={{width:40,height:40,borderRadius:11,
                      background: fridgeMethod === m.id ? 'var(--fn-terra-soft)' : 'var(--fn-linen)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                      {m.icon}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,marginBottom:2,
                        color: fridgeMethod === m.id ? 'var(--fn-terra-dark)' : 'var(--fn-ink)'}}>
                        {m.title}
                      </div>
                      <div style={{fontSize:12,color:'var(--fn-ink-3)',fontWeight:600}}>{m.desc}</div>
                    </div>
                    {fridgeMethod === m.id && (
                      <div style={{width:21,height:21,background:'var(--fn-terra)',borderRadius:'50%',
                        color:'white',fontSize:11,fontWeight:900,display:'flex',
                        alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        ✓
                      </div>
                    )}
                  </div>
                ))}

                {/* Coming soon */}
                <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:13,borderRadius:16,
                  border:'2px dashed var(--fn-terra-soft)',background:'var(--fn-terra-wash)'}}>
                  <div style={{width:40,height:40,borderRadius:11,background:'var(--fn-terra-wash)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                    🛒
                  </div>
                  <div style={{flex:1}}>
                    <span style={{fontSize:9,fontWeight:900,color:'var(--fn-terra)',
                      background:'var(--fn-terra-soft)',padding:'2px 7px',borderRadius:99,
                      display:'inline-block',marginBottom:3,letterSpacing:'.04em'}}>
                      Coming soon
                    </span>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--fn-terra)',marginBottom:2}}>
                      Order → Fridge sync
                    </div>
                    <div style={{fontSize:12,color:'var(--fn-ink-3)',fontWeight:600}}>
                      Auto-sync from your grocery orders
                    </div>
                    <p style={{fontSize:12,color:'var(--fn-ink-2)',fontWeight:600,marginTop:5,lineHeight:1.4}}>
                      Would you want auto-sync for Swiggy Instamart + Blinkit?
                    </p>
                    <button onClick={e => { e.stopPropagation(); setVoted(true) }}
                      style={{marginTop:7,padding:'5px 12px',border:'1.5px solid var(--fn-terra)',
                        borderRadius:99,fontSize:11,fontWeight:800,cursor:'pointer',transition:'all .15s',
                        fontFamily:'var(--fn-font-body)',
                        background: voted ? 'var(--fn-terra)' : 'transparent',
                        color: voted ? 'white' : 'var(--fn-terra)'}}>
                      {voted ? '✓ Voted!' : 'Yes, count me in'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Notifications ── */}
          {step === 5 && (
            <div>
              <p style={{fontSize:14,color:'var(--fn-ink-3)',fontWeight:600,lineHeight:1.55,marginBottom:16}}>
                We&apos;ll remind you before things expire and suggest what to eat. Change anytime in settings.
              </p>

              <div onClick={() => setNotifOn(!notifOn)}
                style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'14px 15px',borderRadius:16,marginBottom:16,cursor:'pointer',
                  border:'2px solid',transition:'all .2s',
                  background: notifOn ? 'var(--fn-terra-wash)' : 'var(--fn-cream)',
                  borderColor: notifOn ? accentColor : 'var(--fn-line)'}}>
                <div style={{display:'flex',alignItems:'center',gap:11}}>
                  <span style={{fontSize:22}}>🔔</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--fn-ink)'}}>Allow notifications</div>
                    <div style={{fontSize:12,color:'var(--fn-ink-3)',fontWeight:600,marginTop:1}}>
                      Stay on top of expiries and meal ideas
                    </div>
                  </div>
                </div>
                <div style={{width:44,height:25,borderRadius:99,position:'relative',flexShrink:0,
                  background: notifOn ? accentColor : '#D4C4BC',transition:'background .2s'}}>
                  <div style={{width:19,height:19,borderRadius:'50%',background:'white',position:'absolute',
                    top:3,transition:'right .2s',right: notifOn ? 3 : 22,
                    boxShadow:'0 1px 4px rgba(0,0,0,.18)'}} />
                </div>
              </div>

              {notifOn && (
                <div>
                  <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:12,display:'block'}}>
                    Choose when to be nudged
                  </label>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:4}}>
                    {[
                      {id:'morning',  icon:'🌅', label:'Morning briefing',    desc:"What's expiring today"},
                      {id:'evening',  icon:'🌆', label:'Evening dinner nudge',desc:'"Cook this tonight"'},
                      {id:'expiry',   icon:'⚠️', label:'Expiry alerts',       desc:'Before items go bad'},
                      {id:'shopping', icon:'🛒', label:'Shopping reminder',   desc:'When stock is low'},
                    ].map(t => (
                      <div key={t.id} onClick={() => setNudgeTimes(toggleArr(nudgeTimes, t.id))}
                        style={{padding:'12px 9px',borderRadius:14,textAlign:'center',cursor:'pointer',
                          border:'2px solid',transition:'all .15s',
                          background: nudgeTimes.includes(t.id) ? 'var(--fn-terra-wash)' : 'var(--fn-cream)',
                          borderColor: nudgeTimes.includes(t.id) ? accentColor : 'var(--fn-line)'}}>
                        <span style={{fontSize:20,marginBottom:4,display:'block'}}>{t.icon}</span>
                        <div style={{fontSize:12,fontWeight:800,marginBottom:2,
                          color: nudgeTimes.includes(t.id) ? 'var(--fn-terra-dark)' : 'var(--fn-ink-2)'}}>
                          {t.label}
                        </div>
                        <div style={{fontSize:11,fontWeight:600,color:'var(--fn-ink-3)'}}>{t.desc}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{height:1,background:'var(--fn-line)',margin:'14px 0'}} />

                  <label style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',marginBottom:10,display:'block'}}>
                    Set your preferred times
                  </label>
                  {[
                    {icon:'☀️', label:'Morning nudge', defaultVal:'07:30'},
                    {icon:'🌙', label:'Evening nudge', defaultVal:'17:00'},
                  ].map(r => (
                    <div key={r.label} style={{display:'flex',alignItems:'center',gap:10,
                      background:'var(--fn-cream)',border:'2px solid var(--fn-line)',
                      borderRadius:14,padding:'11px 13px',marginBottom:8}}>
                      <span style={{fontSize:19}}>{r.icon}</span>
                      <span style={{fontSize:13,fontWeight:800,color:'var(--fn-ink-2)',flex:1}}>{r.label}</span>
                      <input type="time" defaultValue={r.defaultVal}
                        style={{background:'var(--fn-linen)',border:'2px solid var(--fn-line)',
                          borderRadius:9,padding:'6px 9px',fontFamily:'var(--fn-font-body)',
                          fontSize:13,fontWeight:800,color:'var(--fn-ink)',outline:'none',
                          width:88,textAlign:'center'}} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── FOOTER BUTTON ── */}
      <div style={{padding:'10px 22px 26px',background:'white',
        borderTop:'1px solid var(--fn-line)',flexShrink:0}}>
        <button onClick={() => goTo(step + 1)}
          style={{width:'100%',padding:17,border:'none',borderRadius:14,
            fontFamily:'var(--fn-font-body)',fontSize:16,fontWeight:900,cursor:'pointer',
            color:'white',background:accentColor,boxShadow:'0 6px 22px rgba(0,0,0,.18)'}}>
          {step === 5 ? 'All done! 🎉' : 'Next →'}
        </button>
        {(step === 2 || step === 5) && (
          <button onClick={() => goTo(step + 1)}
            style={{width:'100%',padding:10,background:'transparent',color:'var(--fn-ink-3)',
              border:'none',fontFamily:'var(--fn-font-body)',fontSize:13,fontWeight:700,
              cursor:'pointer',marginTop:4}}>
            Skip for now
          </button>
        )}
      </div>

    </div>
  )
}
