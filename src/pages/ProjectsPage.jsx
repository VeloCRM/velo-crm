import { useState } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

const LS_KEY = 'velo_projects'

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] }
}
function saveProjects(p) { localStorage.setItem(LS_KEY, JSON.stringify(p)) }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

const STATUS_STYLES = {
  active:    { color: C.primary,   bg: C.primaryBg },
  on_hold:   { color: C.warning,   bg: C.warningBg },
  completed: { color: C.success,   bg: C.successBg },
  archived:  { color: C.textMuted, bg: C.bg },
}

const STATUS_LABELS = {
  en: { active: 'Active', on_hold: 'On Hold', completed: 'Completed', archived: 'Archived' },
  ar: { active: 'نشط', on_hold: 'معلّق', completed: 'مكتمل', archived: 'مؤرشف' },
}

function ProgressRing({ percent, size = 60 }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  const color = percent >= 80 ? C.success : percent >= 50 ? C.warning : C.danger
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 300ms ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: 13, fontWeight: 700, fill: color }}>
        {percent}%
      </text>
    </svg>
  )
}

function StatusBadge({ status, lang }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.active
  const labels = STATUS_LABELS[lang] || STATUS_LABELS.en
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>
      {labels[status] || status}
    </span>
  )
}

function computeProgress(tasks) {
  if (!tasks || tasks.length === 0) return 0
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100)
}

const EMPTY_PROJECT = {
  name: '', description: '', status: 'active', dueDate: '', team: [],
  tasks: [], milestones: [], contactId: null, dealId: null,
}

export default function ProjectsPage({ t, lang, dir, isRTL, contacts, deals, toast, showConfirm }) {
  const [projects, setProjects] = useState(loadProjects)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState(null)
  const [detailTab, setDetailTab] = useState('tasks')
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const persist = (next) => { setProjects(next); saveProjects(next) }

  // Filtering
  const filtered = filter === 'all' ? projects
    : filter === 'active' ? projects.filter(p => p.status === 'active')
    : projects.filter(p => p.status === 'completed')

  const selected = projects.find(p => p.id === selectedId) || null

  // CRUD helpers
  const openNew = () => { setEditProject({ ...EMPTY_PROJECT }); setShowModal(true) }
  const openEdit = (p) => { setEditProject({ ...p, team: [...(p.team || [])], tasks: [...(p.tasks || [])], milestones: [...(p.milestones || [])] }); setShowModal(true) }

  const saveProject = () => {
    if (!editProject.name.trim()) return
    const now = new Date().toISOString()
    if (editProject.id) {
      const next = projects.map(p => p.id === editProject.id ? { ...editProject } : p)
      persist(next)
    } else {
      persist([...projects, { ...editProject, id: uid(), createdAt: now }])
    }
    setShowModal(false); setEditProject(null)
    toast?.({ type: 'success', message: lang === 'ar' ? 'تم الحفظ' : 'Project saved' })
  }

  const deleteProject = (id) => {
    showConfirm?.({
      message: lang === 'ar' ? 'هل تريد حذف هذا المشروع؟' : 'Delete this project?',
      onConfirm: () => {
        persist(projects.filter(p => p.id !== id))
        if (selectedId === id) setSelectedId(null)
        toast?.({ type: 'success', message: lang === 'ar' ? 'تم الحذف' : 'Project deleted' })
      }
    })
  }

  // Task operations on selected project
  const toggleTask = (taskId) => {
    const next = projects.map(p => {
      if (p.id !== selectedId) return p
      return { ...p, tasks: p.tasks.map(tk => tk.id === taskId ? { ...tk, done: !tk.done } : tk) }
    })
    persist(next)
  }

  const addTask = () => {
    if (!newTaskTitle.trim()) return
    const next = projects.map(p => {
      if (p.id !== selectedId) return p
      return { ...p, tasks: [...p.tasks, { id: uid(), title: newTaskTitle.trim(), done: false, priority: 'medium' }] }
    })
    persist(next)
    setNewTaskTitle('')
  }

  const removeTask = (taskId) => {
    const next = projects.map(p => {
      if (p.id !== selectedId) return p
      return { ...p, tasks: p.tasks.filter(tk => tk.id !== taskId) }
    })
    persist(next)
  }

  const toggleMilestone = (msId) => {
    const next = projects.map(p => {
      if (p.id !== selectedId) return p
      return { ...p, milestones: p.milestones.map(m => m.id === msId ? { ...m, done: !m.done } : m) }
    })
    persist(next)
  }

  // ── Detail View ───────────────────────────────────────────────
  if (selected) {
    const progress = computeProgress(selected.tasks)
    const doneCount = (selected.tasks || []).filter(tk => tk.done).length
    const totalCount = (selected.tasks || []).length
    return (
      <div style={{ direction: dir }}>
        {/* Back button */}
        <button onClick={() => { setSelectedId(null); setDetailTab('tasks') }}
          style={makeBtn('ghost', { marginBottom: 16, gap: 6, padding: '0 8px' })}>
          {isRTL ? Icons.arrowRight(14) : Icons.arrowLeft(14)}
          {lang === 'ar' ? 'العودة للمشاريع' : 'Back to Projects'}
        </button>

        {/* Project header */}
        <div style={{ ...card, padding: 24, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 24 }}>
          <ProgressRing percent={progress} size={72} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, fontFamily: 'DM Sans,Inter,sans-serif' }}>{selected.name}</h1>
              <StatusBadge status={selected.status} lang={lang} />
            </div>
            {selected.description && <p style={{ margin: 0, fontSize: 13, color: C.textSec, marginBottom: 8 }}>{selected.description}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: C.textMuted }}>
              {selected.dueDate && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{Icons.clock(13)} {selected.dueDate}</span>}
              <span>{doneCount}/{totalCount} {lang === 'ar' ? 'مهام' : 'tasks'}</span>
              {(selected.team || []).length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{Icons.users(13)} {selected.team.length}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => openEdit(selected)} style={makeBtn('secondary', { height: 32, padding: '0 12px' })}>{Icons.edit(14)}</button>
            <button onClick={() => deleteProject(selected.id)} style={makeBtn('danger', { height: 32, padding: '0 12px' })}>{Icons.trash(14)}</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          {[
            { key: 'tasks', label: lang === 'ar' ? 'المهام' : 'Tasks' },
            { key: 'milestones', label: lang === 'ar' ? 'المعالم' : 'Milestones' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setDetailTab(tab.key)}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: 'none', background: 'transparent', fontFamily: 'inherit',
                color: detailTab === tab.key ? C.primary : C.textMuted,
                borderBottom: detailTab === tab.key ? `2px solid ${C.primary}` : '2px solid transparent',
                transition: 'all 150ms ease',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tasks tab */}
        {detailTab === 'tasks' && (
          <div style={{ ...card, padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder={lang === 'ar' ? 'أضف مهمة جديدة...' : 'Add a new task...'}
                style={{ ...inputStyle(dir), flex: 1 }} />
              <button onClick={addTask} className="velo-btn-primary" style={makeBtn('primary', { height: 36, padding: '0 14px' })}>{Icons.plus(14)}</button>
            </div>
            {(selected.tasks || []).length === 0 && (
              <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 24 }}>
                {lang === 'ar' ? 'لا توجد مهام بعد' : 'No tasks yet'}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(selected.tasks || []).map(task => (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 6, background: task.done ? C.successBg : C.bg,
                  border: `1px solid ${task.done ? C.successBorder : C.border}`,
                  transition: 'all 150ms ease',
                }}>
                  <div onClick={() => toggleTask(task.id)} style={{
                    width: 20, height: 20, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                    border: task.done ? 'none' : `2px solid ${C.border}`,
                    background: task.done ? C.success : C.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', transition: 'all 150ms ease',
                  }}>
                    {task.done && Icons.check(13)}
                  </div>
                  <span style={{
                    flex: 1, fontSize: 14, color: task.done ? C.textMuted : C.text,
                    textDecoration: task.done ? 'line-through' : 'none',
                  }}>{task.title}</span>
                  {task.priority && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      color: task.priority === 'high' ? C.danger : task.priority === 'medium' ? C.warning : C.textMuted,
                      background: task.priority === 'high' ? C.dangerBg : task.priority === 'medium' ? C.warningBg : C.bg,
                    }}>{task.priority}</span>
                  )}
                  <button onClick={() => removeTask(task.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
                    {Icons.trash(13)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones tab */}
        {detailTab === 'milestones' && (
          <div style={{ ...card, padding: 20 }}>
            {(selected.milestones || []).length === 0 && (
              <p style={{ textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 24 }}>
                {lang === 'ar' ? 'لا توجد معالم بعد' : 'No milestones yet'}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {(selected.milestones || []).map((ms, idx) => (
                <div key={ms.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                  {/* Timeline line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 99, flexShrink: 0,
                      background: ms.done ? C.success : C.white,
                      border: `2px solid ${ms.done ? C.success : C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                      cursor: 'pointer',
                    }} onClick={() => toggleMilestone(ms.id)}>
                      {ms.done && Icons.check(11)}
                    </div>
                    {idx < selected.milestones.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 32, background: C.border }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: 20, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: ms.done ? C.textMuted : C.text,
                      textDecoration: ms.done ? 'line-through' : 'none' }}>
                      {ms.title}
                    </div>
                    {ms.dueDate && (
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {Icons.clock(12)} {ms.dueDate}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── List View ─────────────────────────────────────────────────
  return (
    <div style={{ direction: dir }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>
            {lang === 'ar' ? 'المشاريع' : 'Projects'}
          </h1>
          <p style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
            {filtered.length} {lang === 'ar' ? 'مشروع' : 'projects'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Filter pills */}
          {[
            { key: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
            { key: 'active', label: lang === 'ar' ? 'نشط' : 'Active' },
            { key: 'completed', label: lang === 'ar' ? 'مكتمل' : 'Completed' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              border: `1px solid ${filter === f.key ? C.primary : C.border}`,
              background: filter === f.key ? C.primaryBg : C.white,
              color: filter === f.key ? C.primary : C.textSec,
              cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'inherit',
            }}>
              {f.label}
            </button>
          ))}
          <button onClick={openNew} className="velo-btn-primary" style={makeBtn('primary', { gap: 6 })}>{Icons.plus(14)} {lang === 'ar' ? 'مشروع جديد' : 'New Project'}</button>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <div style={{ color: C.textMuted, marginBottom: 12 }}>{Icons.target(40)}</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            {lang === 'ar' ? 'لا توجد مشاريع' : 'No projects yet'}
          </p>
          <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
            {lang === 'ar' ? 'ابدأ بإنشاء مشروعك الأول' : 'Get started by creating your first project'}
          </p>
          <button onClick={openNew} className="velo-btn-primary" style={makeBtn('primary')}>{Icons.plus(14)} {lang === 'ar' ? 'مشروع جديد' : 'New Project'}</button>
        </div>
      )}

      {/* Project grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
        {filtered.map(project => {
          const progress = computeProgress(project.tasks)
          const doneCount = (project.tasks || []).filter(tk => tk.done).length
          const totalCount = (project.tasks || []).length
          return (
            <div key={project.id} onClick={() => setSelectedId(project.id)}
              style={{
                ...card, padding: 20, cursor: 'pointer',
                transition: 'all 150ms ease', position: 'relative',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 4px 12px ${C.primaryRing}` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)' }}>
              {/* Top row: progress ring + info */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
                <ProgressRing percent={progress} size={60} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'DM Sans,Inter,sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.name}
                    </span>
                    <StatusBadge status={project.status} lang={lang} />
                  </div>
                  {project.description && (
                    <p style={{ margin: 0, fontSize: 12, color: C.textSec, lineHeight: 1.5,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 2, background: C.bg, marginBottom: 14 }}>
                <div style={{
                  height: '100%', borderRadius: 2, transition: 'width 300ms ease',
                  width: `${progress}%`,
                  background: progress >= 80 ? C.success : progress >= 50 ? C.warning : C.danger,
                }} />
              </div>

              {/* Bottom row: meta */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: C.textMuted }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Icons.check(13)} {doneCount}/{totalCount}
                  </span>
                  {project.dueDate && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {Icons.clock(13)} {project.dueDate}
                    </span>
                  )}
                </div>
                {/* Team avatars */}
                {(project.team || []).length > 0 && (
                  <div style={{ display: 'flex', [isRTL ? 'flexDirection' : '']: isRTL ? 'row-reverse' : undefined }}>
                    {project.team.slice(0, 3).map((name, i) => (
                      <div key={i} style={{
                        width: 26, height: 26, borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: [C.primaryBg, C.successBg, C.warningBg, C.purpleBg][i % 4],
                        color: [C.primary, C.success, C.warning, C.purple][i % 4],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${C.white}`,
                        marginLeft: i > 0 && !isRTL ? -8 : 0,
                        marginRight: i > 0 && isRTL ? -8 : 0,
                      }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {project.team.length > 3 && (
                      <div style={{
                        width: 26, height: 26, borderRadius: 99, fontSize: 10, fontWeight: 600,
                        background: C.bg, color: C.textMuted, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: `2px solid ${C.white}`,
                        marginLeft: !isRTL ? -8 : 0, marginRight: isRTL ? -8 : 0,
                      }}>
                        +{project.team.length - 3}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────── */}
      {showModal && editProject && (
        <ProjectModal
          project={editProject}
          setProject={setEditProject}
          onSave={saveProject}
          onClose={() => { setShowModal(false); setEditProject(null) }}
          lang={lang} dir={dir} isRTL={isRTL}
          contacts={contacts} deals={deals}
        />
      )}
    </div>
  )
}

// ── Project Modal Component ─────────────────────────────────────
function ProjectModal({ project, setProject, onSave, onClose, lang, dir, isRTL, contacts, deals }) {
  const [teamInput, setTeamInput] = useState('')
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState('')

  const set = (key, val) => setProject(prev => ({ ...prev, [key]: val }))

  const addTeamMember = () => {
    if (!teamInput.trim()) return
    set('team', [...(project.team || []), teamInput.trim()])
    setTeamInput('')
  }

  const removeTeamMember = (idx) => {
    set('team', (project.team || []).filter((_, i) => i !== idx))
  }

  const addMilestone = () => {
    if (!msTitle.trim()) return
    set('milestones', [...(project.milestones || []), { id: uid(), title: msTitle.trim(), dueDate: msDate, done: false }])
    setMsTitle(''); setMsDate('')
  }

  const removeMilestone = (id) => {
    set('milestones', (project.milestones || []).filter(m => m.id !== id))
  }

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text, fontFamily: 'DM Sans,Inter,sans-serif' }}>
            {project.id
              ? (lang === 'ar' ? 'تعديل المشروع' : 'Edit Project')
              : (lang === 'ar' ? 'مشروع جديد' : 'New Project')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'flex' }}>
            {Icons.x(18)}
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: isRTL ? 0 : 4, paddingLeft: isRTL ? 4 : 0 }}>
          <FormField label={lang === 'ar' ? 'اسم المشروع' : 'Project Name'} dir={dir}>
            <input value={project.name} onChange={e => set('name', e.target.value)}
              placeholder={lang === 'ar' ? 'أدخل اسم المشروع' : 'Enter project name'}
              style={inputStyle(dir)} />
          </FormField>

          <FormField label={lang === 'ar' ? 'الوصف' : 'Description'} dir={dir}>
            <textarea value={project.description} onChange={e => set('description', e.target.value)}
              placeholder={lang === 'ar' ? 'وصف المشروع...' : 'Project description...'}
              rows={3}
              style={{ ...inputStyle(dir), height: 'auto', padding: 12, resize: 'vertical' }} />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label={lang === 'ar' ? 'الحالة' : 'Status'} dir={dir}>
              <select value={project.status} onChange={e => set('status', e.target.value)} style={selectStyle(dir)}>
                <option value="active">{lang === 'ar' ? 'نشط' : 'Active'}</option>
                <option value="on_hold">{lang === 'ar' ? 'معلّق' : 'On Hold'}</option>
                <option value="completed">{lang === 'ar' ? 'مكتمل' : 'Completed'}</option>
                <option value="archived">{lang === 'ar' ? 'مؤرشف' : 'Archived'}</option>
              </select>
            </FormField>

            <FormField label={lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'} dir={dir}>
              <input type="date" value={project.dueDate} onChange={e => set('dueDate', e.target.value)}
                style={inputStyle(dir)} />
            </FormField>
          </div>

          {/* Team members */}
          <FormField label={lang === 'ar' ? 'أعضاء الفريق' : 'Team Members'} dir={dir}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={teamInput} onChange={e => setTeamInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTeamMember())}
                placeholder={lang === 'ar' ? 'أضف عضوًا...' : 'Add member...'}
                style={{ ...inputStyle(dir), flex: 1 }} />
              <button type="button" onClick={addTeamMember} style={makeBtn('secondary', { height: 36, padding: '0 12px' })}>{Icons.plus(14)}</button>
            </div>
            {(project.team || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {project.team.map((name, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    borderRadius: 99, background: C.primaryBg, color: C.primary, fontSize: 12, fontWeight: 500,
                  }}>
                    {Icons.user(12)} {name}
                    <span onClick={() => removeTeamMember(i)} style={{ cursor: 'pointer', display: 'flex', opacity: 0.7 }}>{Icons.x(12)}</span>
                  </span>
                ))}
              </div>
            )}
          </FormField>

          {/* Linked contact / deal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FormField label={lang === 'ar' ? 'جهة الاتصال' : 'Linked Contact'} dir={dir}>
              <select value={project.contactId || ''} onChange={e => set('contactId', e.target.value || null)} style={selectStyle(dir)}>
                <option value="">{lang === 'ar' ? '— لا يوجد —' : '— None —'}</option>
                {(contacts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label={lang === 'ar' ? 'الصفقة' : 'Linked Deal'} dir={dir}>
              <select value={project.dealId || ''} onChange={e => set('dealId', e.target.value || null)} style={selectStyle(dir)}>
                <option value="">{lang === 'ar' ? '— لا يوجد —' : '— None —'}</option>
                {(deals || []).map(d => <option key={d.id} value={d.id}>{d.title || d.name}</option>)}
              </select>
            </FormField>
          </div>

          {/* Milestones */}
          <FormField label={lang === 'ar' ? 'المعالم' : 'Milestones'} dir={dir}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={msTitle} onChange={e => setMsTitle(e.target.value)}
                placeholder={lang === 'ar' ? 'عنوان المعلم' : 'Milestone title'}
                style={{ ...inputStyle(dir), flex: 1 }} />
              <input type="date" value={msDate} onChange={e => setMsDate(e.target.value)}
                style={{ ...inputStyle(dir), width: 150, flex: 'none' }} />
              <button type="button" onClick={addMilestone} style={makeBtn('secondary', { height: 36, padding: '0 12px' })}>{Icons.plus(14)}</button>
            </div>
            {(project.milestones || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {project.milestones.map(ms => (
                  <div key={ms.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ color: C.primary, display: 'flex' }}>{Icons.target(14)}</span>
                    <span style={{ flex: 1, fontSize: 13, color: C.text }}>{ms.title}</span>
                    {ms.dueDate && <span style={{ fontSize: 11, color: C.textMuted }}>{ms.dueDate}</span>}
                    <button onClick={() => removeMilestone(ms.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, display: 'flex' }}>
                      {Icons.trash(13)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormField>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} style={makeBtn('secondary')}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={onSave} className="velo-btn-primary" style={makeBtn('primary')}>
            {Icons.check(14)} {project.id ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (lang === 'ar' ? 'إنشاء المشروع' : 'Create Project')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
