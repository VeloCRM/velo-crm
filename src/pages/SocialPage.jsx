import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { stripHtml } from '../lib/sanitize'
import { isSupabaseConfigured } from '../lib/supabase'

const PLATFORMS = [
  { id:'facebook', name:'Facebook', color:'#1877F2', icon:'f', maxChars:63206 },
  { id:'instagram', name:'Instagram', color:'#E4405F', icon:'📷', maxChars:2200 },
  { id:'twitter', name:'X (Twitter)', color:C.text, icon:'𝕏', maxChars:280 },
  { id:'linkedin', name:'LinkedIn', color:'#0A66C2', icon:'in', maxChars:3000 },
  { id:'tiktok', name:'TikTok', color:'#010101', icon:'♪', maxChars:2200 },
]

const SAMPLE_POSTS = [
  { id:'sp1', text:'Excited to announce our new CRM features! 🚀 Better pipeline management, AI-powered replies, and multi-channel inbox. #CRM #SaaS #Velo', platforms:['facebook','instagram','linkedin'], scheduledAt:'2026-04-10T10:00', status:'scheduled' },
  { id:'sp2', text:'نفخر بإطلاق ميزات جديدة في فيلو CRM! إدارة العملاء أصبحت أسهل. 🎉', platforms:['facebook','instagram'], scheduledAt:'2026-04-08T14:00', status:'published' },
  { id:'sp3', text:'Tips for growing your sales pipeline: 1. Follow up within 24hrs 2. Personalize every message 3. Track everything in your CRM', platforms:['twitter','linkedin'], scheduledAt:'2026-04-12T09:00', status:'scheduled' },
]

const SAMPLE_ANALYTICS = {
  reach: 24500, impressions: 48200, engagement: 4.8, clicks: 1320, followers: 186,
  reachTrend: [800,1200,950,1400,1100,1600,1350,1800,1500,2100,1900,2400,2200,2800,2500,3100,2900,3200,2800,3500,3200,3800,3400,4000,3600,4200,3900,4500,4100,4800],
  topPosts: [
    { id:'tp1', text:'Excited to announce our new CRM features! 🚀', platform:'facebook', reach:8400, likes:342, comments:56, image:null },
    { id:'tp2', text:'نفخر بإطلاق ميزات جديدة في فيلو', platform:'instagram', reach:6200, likes:528, comments:89, image:null },
    { id:'tp3', text:'Tips for growing your sales pipeline...', platform:'linkedin', reach:4100, likes:186, comments:34, image:null },
  ]
}

function loadPosts() {
  try { const stored = JSON.parse(localStorage.getItem('velo_social_posts')||'null'); if (stored) return stored } catch {}
  return isSupabaseConfigured() ? [] : SAMPLE_POSTS
}
function savePosts(p) { localStorage.setItem('velo_social_posts', JSON.stringify(p)) }

export default function SocialPage({ t, lang, dir, isRTL, orgSettings }) {
  const [tab, setTab] = useState('publisher')
  const tabs = [
    { id:'publisher', label: isRTL?'النشر':'Publisher' },
    { id:'calendar', label: isRTL?'التقويم':'Calendar' },
    { id:'analytics', label: isRTL?'التحليلات':'Analytics' },
    { id:'accounts', label: isRTL?'الحسابات':'Accounts' },
  ]

  return (
    <div style={{ direction:dir }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0, fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'التواصل الاجتماعي':'Social Media'}</h1>
      </div>
      <div style={{ display:'flex', gap:0, marginBottom:24, borderBottom:`2px solid ${C.border}` }}>
        {tabs.map(tb => (
          <button type="button" key={tb.id} onClick={() => setTab(tb.id)} style={{ padding:'8px 20px', border:'none', background:'transparent', cursor:'pointer', fontSize:13, fontWeight:tab===tb.id?700:500, color:tab===tb.id?C.primary:C.textSec, borderBottom:tab===tb.id?`2px solid ${C.primary}`:'2px solid transparent', marginBottom:-2, fontFamily:'inherit', transition:'all 150ms ease' }}>
            {tb.label}
          </button>
        ))}
      </div>
      <div className="fade-in" key={tab}>
        {tab === 'publisher' && <PublisherTab lang={lang} dir={dir} isRTL={isRTL} orgSettings={orgSettings} />}
        {tab === 'calendar' && <CalendarTab lang={lang} dir={dir} isRTL={isRTL} />}
        {tab === 'analytics' && <AnalyticsTab lang={lang} dir={dir} isRTL={isRTL} />}
        {tab === 'accounts' && <AccountsTab lang={lang} dir={dir} isRTL={isRTL} />}
      </div>
    </div>
  )
}

function PublisherTab({ lang, dir, isRTL, orgSettings }) {
  const [posts, setPosts] = useState(loadPosts)
  const [text, setText] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['facebook','instagram'])
  const [scheduleMode, setScheduleMode] = useState('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [showAiWriter, setShowAiWriter] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')

  const togglePlatform = (id) => setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(p=>p!==id) : [...prev, id])

  const handlePublish = () => {
    if (!text.trim() || selectedPlatforms.length === 0) return
    const post = { id:`sp_${Date.now()}`, text, platforms:selectedPlatforms, scheduledAt: scheduleMode==='later'&&scheduleDate ? scheduleDate : new Date().toISOString(), status: scheduleMode==='later'?'scheduled':'published' }
    const next = [post, ...posts]
    setPosts(next); savePosts(next)
    setText(''); setScheduleDate('')
  }

  const generateAi = () => {
    const generated = isRTL
      ? `✨ ${aiPrompt}\n\nاكتشف كيف يمكن لـ Velo CRM أن يحول أعمالك. جرّب مجاناً اليوم!\n\n#فيلو #CRM #أعمال`
      : `✨ ${aiPrompt}\n\nDiscover how Velo CRM can transform your business. Try it free today!\n\n#Velo #CRM #Business`
    setText(generated); setShowAiWriter(false); setAiPrompt('')
  }

  return (
    <div style={{ display:'flex', gap:20 }}>
      <div style={{ flex:1 }}>
        {/* Compose */}
        <div style={{ ...card, padding:20, marginBottom:16 }}>
          <textarea value={text} onChange={e=>setText(e.target.value)} rows={6} placeholder={isRTL?'ماذا تريد أن تنشر؟':'What would you like to post?'} style={{ ...inputStyle(dir), resize:'vertical', fontSize:14, lineHeight:1.6 }} />
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button type="button" onClick={()=>setShowAiWriter(true)} style={makeBtn('secondary',{gap:6,fontSize:12})}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              {isRTL?'كتابة ذكية':'AI Write'}
            </button>
          </div>
        </div>

        {/* Platform selector */}
        <div style={{ ...card, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.textSec, marginBottom:12 }}>{isRTL?'المنصات':'Platforms'}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {PLATFORMS.map(p => {
              const sel = selectedPlatforms.includes(p.id)
              return (
                <button type="button" key={p.id} onClick={()=>togglePlatform(p.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:8, border: sel?`2px solid ${p.color}`:`1px solid ${C.border}`, background: sel?`${p.color}10`:C.white, color: sel?p.color:C.textSec, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', minHeight:36, transition:'all 150ms ease' }}>
                  <span style={{ fontSize:14 }}>{p.icon}</span> {p.name}
                </button>
              )
            })}
          </div>
          {text && selectedPlatforms.length > 0 && (
            <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
              {selectedPlatforms.map(pid => {
                const p = PLATFORMS.find(x=>x.id===pid)
                const over = text.length > p.maxChars
                return <span key={pid} style={{ fontSize:12, color: over?C.danger:C.textMuted }}>{p.name}: {text.length}/{p.maxChars}{over?' ⚠️':' ✓'}</span>
              })}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div style={{ ...card, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', gap:8, marginBottom: scheduleMode==='later'?12:0 }}>
            {[{id:'now',label:isRTL?'نشر الآن':'Post Now'},{id:'later',label:isRTL?'جدولة':'Schedule'}].map(o => (
              <button type="button" key={o.id} onClick={()=>setScheduleMode(o.id)} style={{ padding:'8px 16px', borderRadius:8, border: scheduleMode===o.id?`2px solid ${C.primary}`:`1px solid ${C.border}`, background: scheduleMode===o.id?C.primaryBg:C.white, color: scheduleMode===o.id?C.primary:C.textSec, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 150ms ease' }}>{o.label}</button>
            ))}
          </div>
          {scheduleMode==='later' && <input type="datetime-local" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} style={inputStyle(dir)} />}
        </div>

        <button type="button" onClick={handlePublish} disabled={!text.trim()||selectedPlatforms.length===0} className="velo-btn-primary" style={{ ...makeBtn('primary',{gap:6, width:'100%', justifyContent:'center', padding:'12px', fontSize:14}), opacity:(!text.trim()||selectedPlatforms.length===0)?.5:1 }}>
          {scheduleMode==='later' ? (isRTL?'جدولة المنشور':'Schedule Post') : (isRTL?'نشر الآن':'Publish Now')}
        </button>
      </div>

      {/* Preview */}
      <div style={{ width:320, flexShrink:0 }}>
        <div style={{ ...card, padding:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.textSec, marginBottom:12 }}>{isRTL?'معاينة':'Preview'}</div>
          {!text ? <p style={{ fontSize:13, color:C.textMuted, textAlign:'center', padding:20 }}>{isRTL?'اكتب منشورك لمعاينته':'Write your post to see preview'}</p> : selectedPlatforms.map(pid => {
            const p = PLATFORMS.find(x=>x.id===pid)
            return (
              <div key={pid} style={{ marginBottom:12, borderRadius:8, border:`1px solid ${C.border}`, overflow:'hidden' }}>
                <div style={{ padding:'8px 12px', background:`${p.color}10`, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:p.color }}>{p.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:p.color }}>{p.name}</span>
                </div>
                <div style={{ padding:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:C.primaryBg, color:C.primary, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>{(orgSettings?.name||'V').charAt(0)}</div>
                    <div><div style={{ fontSize:12, fontWeight:600, color:C.text }}>{orgSettings?.name||'Velo'}</div><div style={{ fontSize:10, color:C.textMuted }}>Just now</div></div>
                  </div>
                  <p style={{ fontSize:13, color:C.text, lineHeight:1.5, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{text.length > p.maxChars ? text.slice(0,p.maxChars)+'...' : text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showAiWriter && (
        <Modal onClose={()=>setShowAiWriter(false)} dir={dir} width={440}>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 12px', fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'مساعد الكتابة الذكي':'AI Writing Assistant'}</h3>
          <FormField label={isRTL?'وصف فكرة المنشور':'Describe your post idea'} dir={dir}>
            <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} rows={3} placeholder={isRTL?'مثال: إعلان عن تخفيضات الصيف':'e.g. Announce summer sale on dental services'} style={{...inputStyle(dir), resize:'vertical'}} />
          </FormField>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" onClick={()=>setShowAiWriter(false)} style={makeBtn('secondary')}>{isRTL?'إلغاء':'Cancel'}</button>
            <button type="button" onClick={generateAi} disabled={!aiPrompt.trim()} className="velo-btn-primary" style={makeBtn('primary',{gap:6})}>{isRTL?'توليد':'Generate'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CalendarTab({ lang, dir, isRTL }) {
  const [posts] = useState(loadPosts)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const year = currentDate.getFullYear(), month = currentDate.getMonth()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const monthName = new Date(year,month).toLocaleDateString(lang==='ar'?'ar-SA':'en-US',{month:'long', year:'numeric'})
  const weekDays = isRTL ? ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  const getPostsForDate = (d) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return posts.filter(p => p.scheduledAt?.startsWith(dateStr))
  }

  const cells = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let d=1;d<=daysInMonth;d++) cells.push(d)

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <button type="button" onClick={()=>setCurrentDate(new Date(year,month-1,1))} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textSec,display:'flex',transition:'all 150ms ease'}}>{isRTL?Icons.chevronRight(20):Icons.chevronLeft(20)}</button>
        <span style={{ fontSize:16, fontWeight:700, color:C.text, fontFamily:'DM Sans,Inter,sans-serif' }}>{monthName}</span>
        <button type="button" onClick={()=>setCurrentDate(new Date(year,month+1,1))} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textSec,display:'flex',transition:'all 150ms ease'}}>{isRTL?Icons.chevronLeft(20):Icons.chevronRight(20)}</button>
      </div>
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:C.bg, borderBottom:`1px solid ${C.border}` }}>
          {weekDays.map((d,i)=><div key={i} style={{ padding:'8px 4px', textAlign:'center', fontSize:12, fontWeight:500, color:'#374151', textTransform:'uppercase', letterSpacing:'0.05em' }}>{d}</div>)}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {cells.map((day,i) => {
            if(!day) return <div key={i} style={{ minHeight:72, background:C.bg, borderBottom:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }} />
            const dayPosts = getPostsForDate(day)
            return (
              <div key={i} onClick={()=>setSelectedDay(dayPosts.length?day:null)} style={{ minHeight:72, padding:4, borderBottom:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}`, cursor: dayPosts.length?'pointer':'default', transition:'all 150ms ease' }}>
                <div style={{ fontSize:12, fontWeight:500, color:C.text, marginBottom:4 }}>{day}</div>
                {dayPosts.slice(0,2).map(p => (
                  <div key={p.id} style={{ fontSize:10, padding:'2px 4px', marginBottom:2, borderRadius:4, background: p.status==='published'?C.successBg:C.primaryBg, color: p.status==='published'?C.success:C.primary, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.platforms.map(pid=>PLATFORMS.find(x=>x.id===pid)?.icon).join(' ')} {p.text.slice(0,20)}
                  </div>
                ))}
                {dayPosts.length>2 && <div style={{ fontSize:10, color:C.textMuted }}>+{dayPosts.length-2}</div>}
              </div>
            )
          })}
        </div>
      </div>
      {selectedDay && (
        <Modal onClose={()=>setSelectedDay(null)} dir={dir} width={440}>
          <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'0 0 16px', fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'منشورات اليوم':'Posts for this day'}</h3>
          {getPostsForDate(selectedDay).map(p => (
            <div key={p.id} style={{ padding:12, borderRadius:8, border:`1px solid ${C.border}`, marginBottom:8 }}>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>{p.platforms.map(pid=>{const pl=PLATFORMS.find(x=>x.id===pid);return <span key={pid} style={{ fontSize:12, padding:'2px 8px', borderRadius:4, background:`${pl?.color}15`, color:pl?.color, fontWeight:600 }}>{pl?.name}</span>})}</div>
              <p style={{ fontSize:13, color:C.text, lineHeight:1.5, margin:0 }}>{p.text}</p>
              <div style={{ fontSize:12, color:C.textMuted, marginTop:8 }}>{p.scheduledAt?.replace('T',' ')} — {p.status==='published'?(isRTL?'منشور':'Published'):(isRTL?'مجدول':'Scheduled')}</div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

function AnalyticsTab({ lang, dir, isRTL }) {
  const d = isSupabaseConfigured() ? { reach:0, impressions:0, engagement:0, clicks:0, followers:0, posts:0 } : SAMPLE_ANALYTICS
  const metrics = [
    { label: isRTL?'الوصول':'Total Reach', value: d.reach.toLocaleString(), color:C.primary, bg:C.primaryBg },
    { label: isRTL?'الانطباعات':'Impressions', value: d.impressions.toLocaleString(), color:C.purple, bg:C.purpleBg },
    { label: isRTL?'التفاعل':'Engagement', value: d.engagement+'%', color:C.success, bg:C.successBg },
    { label: isRTL?'النقرات':'Link Clicks', value: d.clicks.toLocaleString(), color:C.warning, bg:C.warningBg },
    { label: isRTL?'متابعون جدد':'New Followers', value: '+'+d.followers, color:C.danger, bg:C.dangerBg },
  ]
  const maxReach = Math.max(...d.reachTrend)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:24 }}>
        {metrics.map((m,i)=>(
          <div key={i} style={{ ...card, padding:16, textAlign:'center' }}>
            <div style={{ fontSize:12, color:C.textMuted, fontWeight:600, marginBottom:8 }}>{m.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      {/* Reach chart */}
      <div style={{ ...card, padding:20, marginBottom:20 }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:C.text, margin:'0 0 16px', fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'الوصول — آخر 30 يوم':'Reach — Last 30 Days'}</h3>
        <svg width="100%" viewBox="0 0 600 140" style={{ display:'block' }}>
          <defs><linearGradient id="socialGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.primary} stopOpacity=".15"/><stop offset="100%" stopColor={C.primary} stopOpacity=".01"/></linearGradient></defs>
          {(() => {
            const pts = d.reachTrend.map((v,i)=>({x:20+(i/(d.reachTrend.length-1))*560, y:10+110-(v/maxReach)*110}))
            const line = pts.map((p,i)=>`${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
            const area = `${line} L${pts[pts.length-1].x},120 L${pts[0].x},120 Z`
            return <><path d={area} fill="url(#socialGrad)"/><path d={line} fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round"/></>
          })()}
        </svg>
      </div>
      {/* Top posts */}
      <div style={{ ...card, padding:20 }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:C.text, margin:'0 0 16px', fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'أفضل المنشورات':'Top Performing Posts'}</h3>
        {d.topPosts.map(p => {
          const pl = PLATFORMS.find(x=>x.id===p.platform)
          return (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:40, height:40, borderRadius:8, background:`${pl?.color}15`, color:pl?.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>{pl?.icon}</div>
              <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:13, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.text}</div></div>
              <div style={{ display:'flex', gap:16, fontSize:12, color:C.textSec, flexShrink:0 }}>
                <span>{p.reach.toLocaleString()} {isRTL?'وصول':'reach'}</span>
                <span>❤️ {p.likes}</span>
                <span>💬 {p.comments}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AccountsTab({ lang, dir, isRTL }) {
  const accounts = [
    { id:'fb', name:'Facebook Page', platform:'facebook', icon:'f', color:'#1877F2', connected:true, accountName:'Velo CRM Official', followers:'2.4K', lastPost:'Apr 3, 2026' },
    { id:'ig', name:'Instagram Business', platform:'instagram', icon:'📷', color:'#E4405F', connected:true, accountName:'@velocrm', followers:'1.8K', lastPost:'Apr 2, 2026' },
    { id:'li', name:'LinkedIn Page', platform:'linkedin', icon:'in', color:'#0A66C2', connected:false },
    { id:'tw', name:'X (Twitter)', platform:'twitter', icon:'𝕏', color:C.text, connected:false },
    { id:'tk', name:'TikTok', platform:'tiktok', icon:'♪', color:'#010101', connected:false },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {accounts.map(acc => (
        <div key={acc.id} style={{ ...card, padding:20, display:'flex', alignItems:'center', gap:16, transition:'all 150ms ease' }}>
          <div style={{ width:44, height:44, borderRadius:8, background:`${acc.color}15`, color:acc.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, flexShrink:0 }}>{acc.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{acc.name}</div>
            {acc.connected ? (
              <div style={{ fontSize:13, color:C.textSec, marginTop:4 }}>{acc.accountName} &middot; {acc.followers} {isRTL?'متابع':'followers'} &middot; {isRTL?'آخر نشر:':'Last post:'} {acc.lastPost}</div>
            ) : (
              <div style={{ fontSize:13, color:C.textMuted, marginTop:4 }}>{isRTL?'غير متصل':'Not connected'}</div>
            )}
          </div>
          {acc.connected ? (
            <span style={{ fontSize:12, fontWeight:600, padding:'4px 12px', borderRadius:6, background:C.successBg, color:C.success }}>{isRTL?'متصل':'Connected'}</span>
          ) : (
            <button type="button" className="velo-btn-primary" style={makeBtn('primary',{fontSize:12})}>{isRTL?'ربط':'Connect'}</button>
          )}
        </div>
      ))}
    </div>
  )
}
