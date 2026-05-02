import { useState, useEffect, useRef } from 'react'
import { C, makeBtn, card } from '../design'
import { Icons, Modal, FormField, inputStyle, selectStyle } from '../components/shared'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUSES = ['todo', 'in_progress', 'in_review', 'done']

const STATUS_LABELS = {
  todo:        { en: 'To Do',        ar: 'مهام' },
  in_progress: { en: 'In Progress',  ar: 'قيد التنفيذ' },
  in_review:   { en: 'In Review',    ar: 'قيد المراجعة' },
  done:        { en: 'Done',         ar: 'مكتمل' },
}

const COLUMN_BG = {
  todo:        'rgba(255,255,255,0.02)',
  in_progress: 'rgba(0,255,178,0.04)',
  in_review:   'rgba(124,58,237,0.04)',
  done:        'rgba(0,255,136,0.04)',
}

const PRIORITY_COLORS = {
  urgent: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  high:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  medium: { color: '#00FFB2', bg: 'rgba(0,255,178,0.1)' },
  low:    { color: '#64748b', bg: 'rgba(255,255,255,0.04)' },
}

const PRIORITY_LABELS = {
  urgent: { en: 'Urgent', ar: 'عاجل' },
  high:   { en: 'High',   ar: 'عالي' },
  medium: { en: 'Medium', ar: 'متوسط' },
  low:    { en: 'Low',    ar: 'منخفض' },
}

const PRIORITIES = ['urgent', 'high', 'medium', 'low']

const LS_KEY = 'velo_tasks'

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || [] }
  catch { return [] }
}
function saveTasks(tasks) { localStorage.setItem(LS_KEY, JSON.stringify(tasks)) }
function genId() { return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) }

function formatDate(iso, lang) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

function isDueOverdue(dueDate) {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// ─── Blank Task Factory ────────────────────────────────────────────────────

function blankTask(status = 'todo') {
  return {
    id: genId(),
    title: '',
    description: '',
    status,
    priority: 'medium',
    assignee: '',
    dueDate: '',
    patientId: null,
    subtasks: [],
    comments: [],
    createdAt: new Date().toISOString(),
  }
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function TasksPage({ t, lang, dir, isRTL, contacts, user, toast, showConfirm }) {
  void t
  const [tasks, setTasks] = useState(loadTasks)
  const [view, setView] = useState('board')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [dragId, setDragId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  const persist = (next) => { setTasks(next); saveTasks(next) }

  // ── Stats ──
  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === 'done').length

  // ── CRUD ──
  const handleSaveTask = (task) => {
    const exists = tasks.find(t => t.id === task.id)
    if (exists) {
      persist(tasks.map(t => t.id === task.id ? { ...task } : t))
      if (toast) toast(isRTL ? 'تم تحديث المهمة' : 'Task updated', 'success')
    } else {
      persist([...tasks, { ...task, createdAt: task.createdAt || new Date().toISOString() }])
      if (toast) toast(isRTL ? 'تمت إضافة المهمة' : 'Task added', 'success')
    }
    setShowModal(false)
    setEditTask(null)
  }

  const handleDeleteTask = (id) => {
    const doDelete = () => {
      persist(tasks.filter(t => t.id !== id))
      if (detailTask?.id === id) setDetailTask(null)
      if (toast) toast(isRTL ? 'تم حذف المهمة' : 'Task deleted', 'success')
    }
    if (showConfirm) showConfirm(isRTL ? 'هل تريد حذف هذه المهمة؟' : 'Delete this task?', doDelete)
    else doDelete()
  }

  const openAdd = (status = 'todo') => {
    setEditTask(blankTask(status))
    setShowModal(true)
  }

  const openEdit = (task) => {
    setEditTask({ ...task, subtasks: [...(task.subtasks || [])], comments: [...(task.comments || [])] })
    setShowModal(true)
  }

  // ── Drag and Drop ──
  const onDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e, status) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(status)
  }

  const onDrop = (e, newStatus) => {
    e.preventDefault()
    if (dragId) {
      persist(tasks.map(t => t.id === dragId ? { ...t, status: newStatus } : t))
    }
    setDragId(null)
    setDragOverCol(null)
  }

  // ── Sorting / Filtering ──
  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const getFilteredTasks = () => {
    let list = [...tasks]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.assignee || '').toLowerCase().includes(q))
    }
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus)
    if (filterPriority !== 'all') list = list.filter(t => t.priority === filterPriority)
    list.sort((a, b) => {
      let va = a[sortField] || '', vb = b[sortField] || ''
      if (sortField === 'priority') {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 }
        va = order[va] ?? 4; vb = order[vb] ?? 4
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }

  const getPatientName = (patientId) => {
    if (!patientId || !contacts) return ''
    const c = contacts.find(c => c.id === patientId)
    return c ? (c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : ''
  }

  // ── Render ──
  const T = (en, ar) => lang === 'ar' ? ar : en
  const statusLabel = (s) => STATUS_LABELS[s] ? (lang === 'ar' ? STATUS_LABELS[s].ar : STATUS_LABELS[s].en) : s
  const priorityLabel = (p) => PRIORITY_LABELS[p] ? (lang === 'ar' ? PRIORITY_LABELS[p].ar : PRIORITY_LABELS[p].en) : p

  return (
    <div className="fade-in" style={{ direction: dir, padding: 0 }}>
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>
            {T('Tasks', 'المهام')}
          </h1>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
            {totalTasks} {T('total', 'إجمالي')} &middot; {completedTasks} {T('completed', 'مكتمل')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View Toggle */}
          <div style={{ display: 'inline-flex', borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <button
              onClick={() => setView('board')}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: view === 'board' ? C.primary : C.white, color: view === 'board' ? '#fff' : C.textSec,
                fontFamily: 'inherit', transition: 'all 150ms ease',
              }}
            >
              {T('Board', 'لوحة')}
            </button>
            <button
              onClick={() => setView('list')}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: view === 'list' ? C.primary : C.white, color: view === 'list' ? '#fff' : C.textSec,
                fontFamily: 'inherit', transition: 'all 150ms ease',
              }}
            >
              {T('List', 'قائمة')}
            </button>
          </div>
          <button onClick={() => openAdd()} className="velo-btn-primary" style={makeBtn('primary')}>
            {Icons.plus(14)}
            <span>{T('Add Task', 'إضافة مهمة')}</span>
          </button>
        </div>
      </div>

      {/* ── Board View ─────────────────────────────────── */}
      {view === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minHeight: 400 }}>
          {STATUSES.map(status => {
            const colTasks = tasks.filter(t => t.status === status)
            const isDragOver = dragOverCol === status
            return (
              <div
                key={status}
                onDragOver={(e) => onDragOver(e, status)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => onDrop(e, status)}
                style={{
                  background: COLUMN_BG[status],
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 300,
                  border: isDragOver ? `2px dashed ${C.primary}` : '2px solid transparent',
                  transition: 'border-color 150ms ease',
                }}
              >
                {/* Column Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: status === 'todo' ? C.textMuted : status === 'in_progress' ? C.primary : status === 'in_review' ? C.purple : C.success,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{statusLabel(status)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: C.textMuted, background: C.white,
                      borderRadius: 10, padding: '1px 7px', border: `1px solid ${C.border}`,
                    }}>
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => openAdd(status)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                    title={T('Add task', 'إضافة مهمة')}
                  >
                    {Icons.plus(14)}
                  </button>
                </div>

                {/* Task Cards */}
                {colTasks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 8px', color: C.textMuted, fontSize: 13 }}>
                    {T('No tasks', 'لا توجد مهام')}
                  </div>
                )}
                {colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lang={lang}
                    isRTL={isRTL}
                    getPatientName={getPatientName}
                    onDragStart={onDragStart}
                    onClick={() => setDetailTask(task)}
                    dragging={dragId === task.id}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── List View ──────────────────────────────────── */}
      {view === 'list' && (
        <div>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isRTL ? 'right' : 'left']: 10, color: C.textMuted, pointerEvents: 'none' }}>
                {Icons.search(14)}
              </span>
              <input
                type="text"
                placeholder={T('Search tasks...', 'بحث في المهام...')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle(dir), [isRTL ? 'paddingRight' : 'paddingLeft']: 32 }}
              />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...selectStyle(dir), width: 'auto', minWidth: 130 }}>
              <option value="all">{T('All Status', 'كل الحالات')}</option>
              {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...selectStyle(dir), width: 'auto', minWidth: 130 }}>
              <option value="all">{T('All Priority', 'كل الأولويات')}</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
            </select>
          </div>

          {/* Table */}
          <div style={{ ...card, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {[
                    { key: 'title', label: T('Title', 'العنوان') },
                    { key: 'status', label: T('Status', 'الحالة') },
                    { key: 'priority', label: T('Priority', 'الأولوية') },
                    { key: 'assignee', label: T('Assignee', 'المسؤول') },
                    { key: 'dueDate', label: T('Due Date', 'تاريخ الاستحقاق') },
                    { key: 'patientId', label: T('Patient', 'المريض') },
                    { key: '_actions', label: '' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => col.key !== '_actions' && handleSort(col.key)}
                      style={{
                        padding: '10px 12px', textAlign: isRTL ? 'right' : 'left', fontWeight: 600,
                        color: C.textLabel, fontSize: 12, cursor: col.key !== '_actions' ? 'pointer' : 'default',
                        userSelect: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                      {sortField === col.key && (
                        <span style={{ marginInlineStart: 4, fontSize: 10 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getFilteredTasks().length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: C.textMuted, fontSize: 14 }}>
                      {T('No tasks found', 'لا توجد مهام')}
                    </td>
                  </tr>
                )}
                {getFilteredTasks().map(task => {
                  const cName = getPatientName(task.patientId)
                  const overdue = isDueOverdue(task.dueDate) && task.status !== 'done'
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setDetailTask(task)}
                      style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', transition: 'background 150ms ease' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 500, color: C.text, maxWidth: 260 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title || T('Untitled', 'بدون عنوان')}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge status={task.status} lang={lang} />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <PriorityBadge priority={task.priority} lang={lang} />
                      </td>
                      <td style={{ padding: '10px 12px', color: C.textSec }}>{task.assignee || '—'}</td>
                      <td style={{ padding: '10px 12px', color: overdue ? C.danger : C.textSec, fontWeight: overdue ? 600 : 400 }}>
                        {formatDate(task.dueDate, lang)}
                      </td>
                      <td style={{ padding: '10px 12px', color: C.textSec }}>{cName || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(task) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, borderRadius: 4 }}
                            title={T('Edit', 'تعديل')}
                          >{Icons.edit(14)}</button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteTask(task.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, borderRadius: 4 }}
                            title={T('Delete', 'حذف')}
                          >{Icons.trash(14)}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────── */}
      {showModal && editTask && (
        <TaskFormModal
          task={editTask}
          onSave={handleSaveTask}
          onClose={() => { setShowModal(false); setEditTask(null) }}
          dir={dir}
          isRTL={isRTL}
          lang={lang}
          contacts={contacts}
          T={T}
          statusLabel={statusLabel}
          priorityLabel={priorityLabel}
        />
      )}

      {/* ── Detail Panel (Modal) ──────────────────────── */}
      {detailTask && (
        <TaskDetailModal
          task={tasks.find(t => t.id === detailTask.id) || detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(task) => { setDetailTask(null); openEdit(task) }}
          onDelete={(id) => { handleDeleteTask(id) }}
          onUpdate={(updated) => persist(tasks.map(t => t.id === updated.id ? updated : t))}
          dir={dir}
          isRTL={isRTL}
          lang={lang}
          contacts={contacts}
          user={user}
          T={T}
          getPatientName={getPatientName}
          statusLabel={statusLabel}
          priorityLabel={priorityLabel}
        />
      )}
    </div>
  )
}

// ─── Task Card (Board) ──────────────────────────────────────────────────────

function TaskCard({ task, lang, isRTL, getPatientName, onDragStart, onClick, dragging }) {
  void isRTL
  const cName = getPatientName(task.patientId)
  const overdue = isDueOverdue(task.dueDate) && task.status !== 'done'
  const subtasksDone = (task.subtasks || []).filter(s => s.done).length
  const subtasksTotal = (task.subtasks || []).length

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onClick={onClick}
      style={{
        ...card,
        padding: 12,
        marginBottom: 8,
        cursor: 'grab',
        opacity: dragging ? 0.5 : 1,
        transition: 'box-shadow 150ms ease, opacity 150ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)' }}
    >
      {/* Priority + Title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {task.title || (lang === 'ar' ? 'بدون عنوان' : 'Untitled')}
          </div>
        </div>
      </div>

      {/* Priority badge */}
      <div style={{ marginBottom: 8 }}>
        <PriorityBadge priority={task.priority} lang={lang} />
      </div>

      {/* Subtask progress */}
      {subtasksTotal > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted }}>
            {Icons.check(12)}
            <span>{subtasksDone}/{subtasksTotal}</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: C.border, marginTop: 4 }}>
            <div style={{ height: '100%', borderRadius: 2, background: C.success, width: `${(subtasksDone / subtasksTotal) * 100}%`, transition: 'width 300ms ease' }} />
          </div>
        </div>
      )}

      {/* Footer: assignee, due date, contact */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.assignee && (
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: C.primaryBg, color: C.primary,
              fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title={task.assignee}>
              {getInitials(task.assignee)}
            </div>
          )}
          {cName && (
            <span style={{ fontSize: 11, color: C.textMuted, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cName}
            </span>
          )}
        </div>
        {task.dueDate && (
          <span style={{ fontSize: 11, color: overdue ? C.danger : C.textMuted, fontWeight: overdue ? 600 : 400, display: 'flex', alignItems: 'center', gap: 3 }}>
            {Icons.calendar(10)}
            {formatDate(task.dueDate, lang)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status, lang }) {
  const colors = {
    todo:        { bg: '#F3F4F6', color: '#6B7280' },
    in_progress: { bg: '#DBEAFE', color: '#1D4ED8' },
    in_review:   { bg: '#EDE9FE', color: '#6D28D9' },
    done:        { bg: '#D1FAE5', color: '#047857' },
  }
  const c = colors[status] || colors.todo
  const label = STATUS_LABELS[status] ? (lang === 'ar' ? STATUS_LABELS[status].ar : STATUS_LABELS[status].en) : status
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ─── Priority Badge ─────────────────────────────────────────────────────────

function PriorityBadge({ priority, lang }) {
  const pc = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
  const label = PRIORITY_LABELS[priority] ? (lang === 'ar' ? PRIORITY_LABELS[priority].ar : PRIORITY_LABELS[priority].en) : priority
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: pc.bg, color: pc.color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ─── Task Form Modal ────────────────────────────────────────────────────────

function TaskFormModal({ task, onSave, onClose, dir, isRTL, lang, contacts, T, statusLabel, priorityLabel }) {
  void lang
  void isRTL
  const [form, setForm] = useState({ ...task })
  const [newSubtask, setNewSubtask] = useState('')
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addSubtask = () => {
    if (!newSubtask.trim()) return
    set('subtasks', [...(form.subtasks || []), { id: genId(), title: newSubtask.trim(), done: false }])
    setNewSubtask('')
  }

  const removeSubtask = (id) => set('subtasks', (form.subtasks || []).filter(s => s.id !== id))
  const toggleSubtask = (id) => set('subtasks', (form.subtasks || []).map(s => s.id === id ? { ...s, done: !s.done } : s))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave(form)
  }

  const isNew = !task.createdAt || task.title === ''

  return (
    <Modal onClose={onClose} dir={dir} width={560}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, fontFamily: 'DM Sans,Inter,sans-serif' }}>
            {isNew ? T('New Task', 'مهمة جديدة') : T('Edit Task', 'تعديل المهمة')}
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4 }}>
            {Icons.x(18)}
          </button>
        </div>

        <FormField label={T('Title', 'العنوان')} dir={dir}>
          <input
            ref={titleRef}
            type="text"
            required
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder={T('Task title...', 'عنوان المهمة...')}
            style={inputStyle(dir)}
          />
        </FormField>

        <FormField label={T('Description', 'الوصف')} dir={dir}>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder={T('Add a description...', 'أضف وصفاً...')}
            rows={3}
            style={{ ...inputStyle(dir), height: 'auto', padding: '8px 12px', resize: 'vertical' }}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={T('Status', 'الحالة')} dir={dir}>
            <select value={form.status} onChange={e => set('status', e.target.value)} style={selectStyle(dir)}>
              {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </FormField>
          <FormField label={T('Priority', 'الأولوية')} dir={dir}>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={selectStyle(dir)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p)}</option>)}
            </select>
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={T('Assignee', 'المسؤول')} dir={dir}>
            <input
              type="text"
              value={form.assignee}
              onChange={e => set('assignee', e.target.value)}
              placeholder={T('Assignee name', 'اسم المسؤول')}
              style={inputStyle(dir)}
            />
          </FormField>
          <FormField label={T('Due Date', 'تاريخ الاستحقاق')} dir={dir}>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => set('dueDate', e.target.value)}
              style={inputStyle(dir)}
            />
          </FormField>
        </div>

        <FormField label={T('Patient', 'المريض')} dir={dir}>
          <select value={form.patientId || ''} onChange={e => set('patientId', e.target.value || null)} style={selectStyle(dir)}>
            <option value="">{T('None', 'لا يوجد')}</option>
            {(contacts || []).map(c => (
              <option key={c.id} value={c.id}>{c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}</option>
            ))}
          </select>
        </FormField>

        {/* ── Subtasks Section ─── */}
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.textLabel, marginBottom: 8 }}>
            {T('Subtasks', 'المهام الفرعية')}
          </label>
          {(form.subtasks || []).map(sub => (
            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 0' }}>
              <input
                type="checkbox"
                checked={sub.done}
                onChange={() => toggleSubtask(sub.id)}
                style={{ cursor: 'pointer', accentColor: C.primary }}
              />
              <span style={{
                flex: 1, fontSize: 13, color: sub.done ? C.textMuted : C.text,
                textDecoration: sub.done ? 'line-through' : 'none',
              }}>
                {sub.title}
              </span>
              <button
                type="button"
                onClick={() => removeSubtask(sub.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 2 }}
              >{Icons.x(12)}</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
              placeholder={T('Add subtask...', 'إضافة مهمة فرعية...')}
              style={{ ...inputStyle(dir), flex: 1 }}
            />
            <button type="button" onClick={addSubtask} style={makeBtn('secondary', { height: 36, padding: '0 12px' })}>
              {Icons.plus(14)}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <button type="button" onClick={onClose} style={makeBtn('secondary')}>
            {T('Cancel', 'إلغاء')}
          </button>
          <button type="submit" className="velo-btn-primary" style={makeBtn('primary')}>
            {isNew ? T('Create Task', 'إنشاء المهمة') : T('Save Changes', 'حفظ التغييرات')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Task Detail Modal ──────────────────────────────────────────────────────

function TaskDetailModal({ task, onClose, onEdit, onDelete, onUpdate, dir, isRTL, lang, contacts, user, T, getPatientName, statusLabel, priorityLabel }) {
  void contacts
  void isRTL
  void priorityLabel
  const [newComment, setNewComment] = useState('')
  const [inlineStatus, setInlineStatus] = useState(task.status)
  const commentInputRef = useRef(null)

  useEffect(() => { setInlineStatus(task.status) }, [task.status])

  const subtasks = task.subtasks || []
  const comments = task.comments || []
  const subtasksDone = subtasks.filter(s => s.done).length
  const subtasksTotal = subtasks.length
  const progressPct = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0
  const cName = getPatientName(task.patientId)
  const overdue = isDueOverdue(task.dueDate) && task.status !== 'done'

  const handleStatusChange = (newStatus) => {
    setInlineStatus(newStatus)
    onUpdate({ ...task, status: newStatus })
  }

  const toggleSubtask = (subId) => {
    const updated = { ...task, subtasks: task.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s) }
    onUpdate(updated)
  }

  const addComment = () => {
    if (!newComment.trim()) return
    const comment = {
      id: genId(),
      text: newComment.trim(),
      author: user?.name || user?.email || (lang === 'ar' ? 'أنت' : 'You'),
      date: new Date().toISOString(),
    }
    onUpdate({ ...task, comments: [...(task.comments || []), comment] })
    setNewComment('')
  }

  return (
    <Modal onClose={onClose} dir={dir} width={640}>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px', fontFamily: 'DM Sans,Inter,sans-serif', lineHeight: 1.3 }}>
              {task.title || T('Untitled', 'بدون عنوان')}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <PriorityBadge priority={task.priority} lang={lang} />
              <select
                value={inlineStatus}
                onChange={e => handleStatusChange(e.target.value)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.border}`,
                  background: C.white, color: C.textSec, cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 6, borderRadius: 4 }} title={T('Edit', 'تعديل')}>
              {Icons.edit(16)}
            </button>
            <button onClick={() => onDelete(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 6, borderRadius: 4 }} title={T('Delete', 'حذف')}>
              {Icons.trash(16)}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 6, borderRadius: 4 }}>
              {Icons.x(18)}
            </button>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div style={{ marginBottom: 20, padding: 12, background: C.bg, borderRadius: 6, fontSize: 13, color: C.textSec, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {task.description}
          </div>
        )}

        {/* Meta Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <DetailField icon={Icons.user(14)} label={T('Assignee', 'المسؤول')} value={task.assignee || '—'} />
          <DetailField
            icon={Icons.calendar(14)}
            label={T('Due Date', 'تاريخ الاستحقاق')}
            value={formatDate(task.dueDate, lang)}
            valueColor={overdue ? C.danger : undefined}
          />
          {cName && <DetailField icon={Icons.user(14)} label={T('Patient', 'المريض')} value={cName} />}
        </div>

        {/* Subtasks */}
        {subtasksTotal > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{T('Subtasks', 'المهام الفرعية')}</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>{subtasksDone}/{subtasksTotal} ({progressPct}%)</span>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, borderRadius: 3, background: C.border, marginBottom: 10 }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 300ms ease',
                background: progressPct === 100 ? C.success : C.primary,
                width: `${progressPct}%`,
              }} />
            </div>
            {subtasks.map(sub => (
              <div
                key={sub.id}
                onClick={() => toggleSubtask(sub.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                  cursor: 'pointer', transition: 'background 150ms ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, border: `2px solid ${sub.done ? C.success : C.border}`,
                  background: sub.done ? C.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 150ms ease', flexShrink: 0,
                }}>
                  {sub.done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{
                  fontSize: 13, color: sub.done ? C.textMuted : C.text,
                  textDecoration: sub.done ? 'line-through' : 'none',
                }}>
                  {sub.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Comments */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 12 }}>
            {T('Comments', 'التعليقات')} {comments.length > 0 && `(${comments.length})`}
          </span>

          {comments.length === 0 && (
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
              {T('No comments yet.', 'لا توجد تعليقات بعد.')}
            </div>
          )}

          {comments.map(comment => (
            <div key={comment.id} style={{ marginBottom: 12, padding: '10px 12px', background: C.bg, borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{comment.author}</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {comment.date ? new Date(comment.date).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{comment.text}</div>
            </div>
          ))}

          {/* Add comment */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={commentInputRef}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
              placeholder={T('Write a comment...', 'اكتب تعليقاً...')}
              rows={2}
              style={{ ...inputStyle(dir), flex: 1, height: 'auto', padding: '8px 12px', resize: 'none' }}
            />
            <button
              type="button"
              onClick={addComment}
              disabled={!newComment.trim()}
              style={{
                ...makeBtn('primary', { height: 36, padding: '0 14px' }),
                opacity: newComment.trim() ? 1 : 0.5,
              }}
            >
              {T('Send', 'إرسال')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Detail Field Helper ────────────────────────────────────────────────────

function DetailField({ icon, label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: C.bg, borderRadius: 6 }}>
      <span style={{ color: C.textMuted, flexShrink: 0, display: 'flex' }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: valueColor || C.text }}>{value}</div>
      </div>
    </div>
  )
}
