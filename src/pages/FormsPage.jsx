import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'
import { sanitizeText, sanitizeNotes, stripHtml } from '../lib/sanitize'

const FIELD_TYPES = [
  { id:'short_text', icon:'Aa', label:'Short Text', ar:'نص قصير' },
  { id:'long_text', icon:'¶', label:'Long Text', ar:'نص طويل' },
  { id:'email', icon:'@', label:'Email', ar:'بريد إلكتروني' },
  { id:'phone', icon:'📞', label:'Phone', ar:'هاتف' },
  { id:'number', icon:'#', label:'Number', ar:'رقم' },
  { id:'dropdown', icon:'▼', label:'Dropdown', ar:'قائمة منسدلة' },
  { id:'checkbox', icon:'☑', label:'Checkbox', ar:'مربع اختيار' },
  { id:'radio', icon:'◉', label:'Radio Buttons', ar:'أزرار اختيار' },
  { id:'date', icon:'📅', label:'Date Picker', ar:'تاريخ' },
  { id:'file', icon:'📎', label:'File Upload', ar:'رفع ملف' },
  { id:'header', icon:'H', label:'Section Header', ar:'عنوان قسم' },
  { id:'divider', icon:'—', label:'Divider', ar:'فاصل' },
]

function loadForms() { try { return JSON.parse(localStorage.getItem('velo_forms') || '[]') } catch { return [] } }
function saveForms(f) { localStorage.setItem('velo_forms', JSON.stringify(f)) }

export default function FormsPage({ t, lang, dir, isRTL }) {
  const [forms, setForms] = useState(loadForms)
  const [editingForm, setEditingForm] = useState(null)
  const [previewForm, setPreviewForm] = useState(null)
  const [viewSubmissions, setViewSubmissions] = useState(null)

  const persist = (next) => { setForms(next); saveForms(next) }
  const deleteForm = (id) => persist(forms.filter(f => f.id !== id))

  if (editingForm !== null) {
    const form = editingForm === 'new' ? null : forms.find(f => f.id === editingForm)
    return <FormBuilder form={form} lang={lang} dir={dir} isRTL={isRTL}
      onSave={(f) => { persist(f.id ? forms.map(x => x.id === f.id ? f : x) : [...forms, { ...f, id: `form_${Date.now()}`, createdAt: new Date().toISOString().slice(0,10), submissions: [] }]); setEditingForm(null) }}
      onCancel={() => setEditingForm(null)} />
  }

  if (previewForm) {
    const form = forms.find(f => f.id === previewForm)
    return <FormPreview form={form} lang={lang} dir={dir} isRTL={isRTL} onBack={() => setPreviewForm(null)} />
  }

  if (viewSubmissions) {
    const form = forms.find(f => f.id === viewSubmissions)
    return <SubmissionsView form={form} lang={lang} dir={dir} isRTL={isRTL} onBack={() => setViewSubmissions(null)} />
  }

  return (
    <div style={{ direction: dir }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, color:C.text, margin:0, fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'النماذج':'Forms'}</h1>
          <p style={{ fontSize:13, color:C.textSec, marginTop:4 }}>{forms.length} {isRTL?'نموذج':'forms'}</p>
        </div>
        <button type="button" onClick={() => setEditingForm('new')} style={makeBtn('primary',{gap:6})}>{Icons.plus(14)} {isRTL?'نموذج جديد':'New Form'}</button>
      </div>

      {forms.length === 0 ? (
        <div style={{ ...card, padding:48, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
          <h3 style={{ fontSize:18, fontWeight:700, color:C.text, margin:'0 0 8px', fontFamily:'DM Sans,Inter,sans-serif' }}>{isRTL?'لا توجد نماذج بعد':'No forms yet'}</h3>
          <p style={{ fontSize:13, color:C.textMuted, margin:'0 0 24px' }}>{isRTL?'أنشئ نموذجاً لجمع بيانات العملاء':'Create a form to collect customer data'}</p>
          <button type="button" onClick={() => setEditingForm('new')} style={makeBtn('primary',{gap:6})}>{Icons.plus(14)} {isRTL?'نموذج جديد':'New Form'}</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
          {forms.map(f => (
            <div key={f.id} style={{ ...card, padding:20, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <h3 style={{ fontSize:14, fontWeight:600, color:C.text, margin:0 }}>{f.title || (isRTL?'نموذج بدون عنوان':'Untitled Form')}</h3>
                <span style={{ fontSize:12, fontWeight:600, padding:'2px 8px', borderRadius:6, background: f.status==='published' ? C.successBg : C.bg, color: f.status==='published' ? C.success : C.textMuted }}>
                  {f.status==='published' ? (isRTL?'نشط':'Active') : (isRTL?'مسودة':'Draft')}
                </span>
              </div>
              <div style={{ fontSize:13, color:C.textMuted }}>{f.fields?.length||0} {isRTL?'حقل':'fields'} &middot; {(f.submissions||[]).length} {isRTL?'إرسال':'submissions'} &middot; {f.createdAt}</div>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="button" onClick={() => setEditingForm(f.id)} style={makeBtn('secondary',{fontSize:12,padding:'4px 12px',gap:4})}>{Icons.edit(12)} {isRTL?'تعديل':'Edit'}</button>
                <button type="button" onClick={() => setPreviewForm(f.id)} style={makeBtn('secondary',{fontSize:12,padding:'4px 12px',gap:4})}>{Icons.eye(12)} {isRTL?'معاينة':'Preview'}</button>
                <button type="button" onClick={() => setViewSubmissions(f.id)} style={makeBtn('secondary',{fontSize:12,padding:'4px 12px',gap:4})}>{isRTL?'الإرسالات':'Submissions'}</button>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/form/${f.id}`) }} style={makeBtn('secondary',{fontSize:12,padding:'4px 12px',gap:4})}>{Icons.link(12)} {isRTL?'نسخ الرابط':'Copy Link'}</button>
                <button type="button" onClick={() => deleteForm(f.id)} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textMuted,display:'flex',padding:4,transition:'all 150ms ease'}}>{Icons.trash(14)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Form Builder ────────────────────────────────────────────────────────────
function FormBuilder({ form, lang, dir, isRTL, onSave, onCancel }) {
  const [title, setTitle] = useState(form?.title || '')
  const [description, setDescription] = useState(form?.description || '')
  const [successMsg, setSuccessMsg] = useState(form?.successMsg || (isRTL?'شكراً لإرسالك!':'Thank you for your submission!'))
  const [fields, setFields] = useState(form?.fields || [])
  const [status, setStatus] = useState(form?.status || 'draft')
  const [selectedField, setSelectedField] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)

  const addField = (type) => {
    const ft = FIELD_TYPES.find(f=>f.id===type)
    setFields(prev => [...prev, { id:`fld_${Date.now()}`, type, label: isRTL?ft.ar:ft.label, placeholder:'', required:false, options: type==='dropdown'||type==='radio' ? ['Option 1','Option 2'] : [] }])
  }
  const removeField = (idx) => { setFields(prev=>prev.filter((_,i)=>i!==idx)); setSelectedField(null) }
  const updateField = (idx, key, val) => setFields(prev=>prev.map((f,i)=>i===idx?{...f,[key]:val}:f))

  const handleDragStart = (idx) => setDragIdx(idx)
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== idx) {
      setFields(prev => { const n=[...prev]; const item=n.splice(dragIdx,1)[0]; n.splice(idx,0,item); return n })
      setDragIdx(idx)
    }
  }

  return (
    <div style={{ direction:dir }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button type="button" onClick={onCancel} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textSec,display:'flex',transition:'all 150ms ease'}}>{isRTL?Icons.arrowRight(20):Icons.arrowLeft(20)}</button>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder={isRTL?'عنوان النموذج...':'Form title...'} style={{border:'none',outline:'none',fontSize:22,fontWeight:700,color:C.text,fontFamily:'DM Sans,Inter,sans-serif',background:'transparent',direction:dir,width:300}} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button type="button" onClick={()=>onSave({...form, id:form?.id, title, description, successMsg, fields, status:'draft', submissions:form?.submissions||[]})} style={makeBtn('secondary')}>{isRTL?'حفظ كمسودة':'Save Draft'}</button>
          <button type="button" onClick={()=>onSave({...form, id:form?.id, title, description, successMsg, fields, status:'published', submissions:form?.submissions||[]})} style={makeBtn('primary')}>{isRTL?'نشر':'Publish'}</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:20 }}>
        {/* Field types panel */}
        <div style={{ width:180, flexShrink:0 }}>
          <div style={{ ...card, padding:12 }}>
            <div style={{ fontSize:12, fontWeight:500, color:C.textMuted, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>{isRTL?'أنواع الحقول':'Field Types'}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {FIELD_TYPES.map(ft => (
                <button type="button" key={ft.id} onClick={()=>addField(ft.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, color:C.text, textAlign:isRTL?'right':'left', minHeight:32, transition:'all 150ms ease' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ width:24, textAlign:'center', fontSize:14, color:C.textMuted }}>{ft.icon}</span>
                  {isRTL?ft.ar:ft.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex:1 }}>
          <div style={{ ...card, padding:24, marginBottom:16 }}>
            <input value={description} onChange={e=>setDescription(e.target.value)} placeholder={isRTL?'وصف النموذج...':'Form description...'} style={{...inputStyle(dir), border:'none', background:C.bg, fontSize:13}} />
          </div>

          {fields.length === 0 ? (
            <div style={{ ...card, padding:48, textAlign:'center', border:`2px dashed ${C.border}` }}>
              <p style={{ fontSize:14, color:C.textMuted }}>{isRTL?'اضغط على نوع حقل لإضافته':'Click a field type to add it'}</p>
            </div>
          ) : fields.map((field, idx) => (
            <div key={field.id} draggable onDragStart={()=>handleDragStart(idx)} onDragOver={e=>handleDragOver(e,idx)} onDragEnd={()=>setDragIdx(null)}
              onClick={()=>setSelectedField(idx)}
              style={{ ...card, padding:16, marginBottom:8, cursor:'pointer', border: selectedField===idx ? `2px solid ${C.primary}` : `1px solid ${C.border}`, transition:'all 150ms ease' }}>
              {field.type === 'header' ? (
                <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:0, fontFamily:'DM Sans,Inter,sans-serif' }}>{field.label}</h3>
              ) : field.type === 'divider' ? (
                <hr style={{ border:'none', borderTop:`1px solid ${C.border}`, margin:'8px 0' }} />
              ) : (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <label style={{ fontSize:13, fontWeight:600, color:C.text }}>{field.label} {field.required && <span style={{color:C.danger}}>*</span>}</label>
                    <button type="button" onClick={e=>{e.stopPropagation();removeField(idx)}} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textMuted,transition:'all 150ms ease'}}>{Icons.x(14)}</button>
                  </div>
                  {['short_text','email','phone','number'].includes(field.type) && <input disabled placeholder={field.placeholder||field.label} style={{...inputStyle(dir), background:C.bg, opacity:.7}} />}
                  {field.type === 'long_text' && <textarea disabled placeholder={field.placeholder} rows={2} style={{...inputStyle(dir), background:C.bg, opacity:.7, resize:'none'}} />}
                  {field.type === 'date' && <input disabled type="date" style={{...inputStyle(dir), background:C.bg, opacity:.7}} />}
                  {field.type === 'file' && <div style={{padding:16,border:`1px dashed ${C.border}`,borderRadius:8,textAlign:'center',fontSize:13,color:C.textMuted}}>{isRTL?'رفع ملف':'Upload file'}</div>}
                  {(field.type==='dropdown') && <select disabled style={{...selectStyle(dir),background:C.bg,opacity:.7}}>{field.options.map((o,i)=><option key={i}>{o}</option>)}</select>}
                  {field.type==='radio' && <div style={{display:'flex',flexDirection:'column',gap:4}}>{field.options.map((o,i)=><label key={i} style={{fontSize:13,color:C.textSec,display:'flex',alignItems:'center',gap:8}}><input type="radio" disabled/>{o}</label>)}</div>}
                  {field.type==='checkbox' && <label style={{fontSize:13,color:C.textSec,display:'flex',alignItems:'center',gap:8}}><input type="checkbox" disabled/>{field.label}</label>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Field settings panel */}
        {selectedField !== null && fields[selectedField] && (
          <div style={{ width:240, flexShrink:0 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:12, fontWeight:500, color:C.textMuted, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>{isRTL?'إعدادات الحقل':'Field Settings'}</div>
              <FormField label={isRTL?'التسمية':'Label'} dir={dir}><input value={fields[selectedField].label} onChange={e=>updateField(selectedField,'label',e.target.value)} style={inputStyle(dir)} /></FormField>
              {!['header','divider'].includes(fields[selectedField].type) && (
                <>
                  <FormField label={isRTL?'نص توضيحي':'Placeholder'} dir={dir}><input value={fields[selectedField].placeholder||''} onChange={e=>updateField(selectedField,'placeholder',e.target.value)} style={inputStyle(dir)} /></FormField>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0' }}>
                    <span style={{ fontSize:13, color:C.text }}>{isRTL?'مطلوب':'Required'}</span>
                    <div onClick={()=>updateField(selectedField,'required',!fields[selectedField].required)} className={`toggle-track${fields[selectedField].required?' active':''}`}><div className="toggle-knob"/></div>
                  </div>
                </>
              )}
              {['dropdown','radio'].includes(fields[selectedField].type) && (
                <FormField label={isRTL?'الخيارات':'Options'} dir={dir}>
                  {(fields[selectedField].options||[]).map((opt,oi) => (
                    <div key={oi} style={{ display:'flex', gap:4, marginBottom:4 }}>
                      <input value={opt} onChange={e=>{const opts=[...fields[selectedField].options]; opts[oi]=e.target.value; updateField(selectedField,'options',opts)}} style={{...inputStyle(dir), padding:'4px 8px', fontSize:13}} />
                      <button type="button" onClick={()=>{const opts=fields[selectedField].options.filter((_,i)=>i!==oi); updateField(selectedField,'options',opts)}} style={{border:'none',background:'transparent',cursor:'pointer',color:C.textMuted,transition:'all 150ms ease'}}>{Icons.x(12)}</button>
                    </div>
                  ))}
                  <button type="button" onClick={()=>updateField(selectedField,'options',[...(fields[selectedField].options||[]),''])} style={{border:'none',background:'transparent',color:C.primary,fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:600,marginTop:4,transition:'all 150ms ease'}}>{isRTL?'+ إضافة خيار':'+ Add option'}</button>
                </FormField>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Form Preview ────────────────────────────────────────────────────────────
function FormPreview({ form, lang, dir, isRTL, onBack }) {
  if (!form) return null
  return (
    <div style={{ direction:dir }}>
      <button type="button" onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, border:'none', background:'transparent', cursor:'pointer', color:C.textSec, fontFamily:'inherit', fontSize:13, marginBottom:16, transition:'all 150ms ease' }}>
        {isRTL?Icons.arrowRight(16):Icons.arrowLeft(16)} {isRTL?'رجوع':'Back'}
      </button>
      <div style={{ maxWidth:600, margin:'0 auto' }}>
        <div style={{ ...card, padding:32 }}>
          <h2 style={{ fontSize:22, fontWeight:700, color:C.text, margin:'0 0 8px', fontFamily:'DM Sans,Inter,sans-serif' }}>{form.title || 'Untitled Form'}</h2>
          {form.description && <p style={{ fontSize:13, color:C.textSec, margin:'0 0 24px' }}>{form.description}</p>}
          <form onSubmit={e=>e.preventDefault()} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {(form.fields||[]).map((field, idx) => (
              <div key={field.id}>
                {field.type === 'header' && <h3 style={{ fontSize:16, fontWeight:700, color:C.text, margin:'8px 0 0', fontFamily:'DM Sans,Inter,sans-serif' }}>{field.label}</h3>}
                {field.type === 'divider' && <hr style={{ border:'none', borderTop:`1px solid ${C.border}`, margin:'8px 0' }} />}
                {!['header','divider'].includes(field.type) && (
                  <div>
                    <label style={{ display:'block', fontSize:13, fontWeight:600, color:C.textSec, marginBottom:4 }}>{field.label} {field.required && <span style={{color:C.danger}}>*</span>}</label>
                    {['short_text','email','phone','number'].includes(field.type) && <input type={field.type==='email'?'email':field.type==='phone'?'tel':field.type==='number'?'number':'text'} placeholder={field.placeholder} style={inputStyle(dir)} />}
                    {field.type === 'long_text' && <textarea placeholder={field.placeholder} rows={3} style={{...inputStyle(dir), resize:'vertical'}} />}
                    {field.type === 'date' && <input type="date" style={inputStyle(dir)} />}
                    {field.type === 'file' && <input type="file" style={{fontSize:13}} />}
                    {field.type === 'dropdown' && <select style={selectStyle(dir)}><option value="">{isRTL?'اختر...':'Select...'}</option>{(field.options||[]).map((o,i)=><option key={i} value={o}>{o}</option>)}</select>}
                    {field.type === 'radio' && <div style={{display:'flex',flexDirection:'column',gap:8}}>{(field.options||[]).map((o,i)=><label key={i} style={{fontSize:13,color:C.text,display:'flex',alignItems:'center',gap:8}}><input type="radio" name={field.id}/>{o}</label>)}</div>}
                    {field.type === 'checkbox' && <label style={{fontSize:13,color:C.text,display:'flex',alignItems:'center',gap:8}}><input type="checkbox"/>{field.label}</label>}
                  </div>
                )}
              </div>
            ))}
            <button type="submit" style={{ width:'100%', padding:'12px', borderRadius:6, border:'none', background:C.primary, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginTop:8, transition:'all 150ms ease' }}>
              {isRTL?'إرسال':'Submit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Submissions View ────────────────────────────────────────────────────────
function SubmissionsView({ form, lang, dir, isRTL, onBack }) {
  if (!form) return null
  const submissions = form.submissions || []
  const fieldLabels = (form.fields||[]).filter(f=>!['header','divider'].includes(f.type)).map(f=>f.label)

  return (
    <div style={{ direction:dir }}>
      <button type="button" onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, border:'none', background:'transparent', cursor:'pointer', color:C.textSec, fontFamily:'inherit', fontSize:13, marginBottom:16, transition:'all 150ms ease' }}>
        {isRTL?Icons.arrowRight(16):Icons.arrowLeft(16)} {isRTL?'رجوع':'Back'}
      </button>
      <h2 style={{ fontSize:20, fontWeight:700, color:C.text, margin:'0 0 16px', fontFamily:'DM Sans,Inter,sans-serif' }}>{form.title} — {isRTL?'الإرسالات':'Submissions'} ({submissions.length})</h2>
      {submissions.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center' }}>
          <p style={{ fontSize:14, color:C.textMuted }}>{isRTL?'لا توجد إرسالات بعد':'No submissions yet'}</p>
        </div>
      ) : (
        <div style={{ ...card, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ background:C.bg, borderBottom:`1px solid ${C.border}` }}>
                <th style={{ padding:'8px 12px', textAlign:isRTL?'right':'left', fontWeight:500, color:'#374151', whiteSpace:'nowrap', fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>{isRTL?'التاريخ':'Date'}</th>
                {fieldLabels.map((l,i)=><th key={i} style={{ padding:'8px 12px', textAlign:isRTL?'right':'left', fontWeight:500, color:'#374151', whiteSpace:'nowrap', fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em' }}>{l}</th>)}
              </tr></thead>
              <tbody>{submissions.map((sub,si)=>(
                <tr key={si} style={{ borderBottom:`1px solid ${C.border}`, transition:'all 150ms ease' }}>
                  <td style={{ padding:'8px 12px', color:C.textMuted, whiteSpace:'nowrap', fontSize:13 }}>{sub.date}</td>
                  {fieldLabels.map((l,i)=><td key={i} style={{ padding:'8px 12px', color:C.text, fontSize:14 }}>{sub.data?.[l]||'—'}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
